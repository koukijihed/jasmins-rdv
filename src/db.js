// Base de données locale du prototype (localStorage) + règles métier.
// L'unicité d'un créneau est contrôlée dans une transaction synchrone, comme
// le ferait un index UNIQUE (medecin_id, date, heure) côté serveur.

import {
  creneauId,
  creneauDeId,
  creneauxEntre,
  estJourOuvre,
  heuresDuJour,
  parseISODate,
  todayISO,
  addDaysISO,
  estDansLePasse,
} from "./slots.js";
import { creerSeed } from "./seed.js";
import {
  calculerRappels,
  finaliser,
  smsConfirmation,
  smsRappelVeille,
  smsRappel3h,
  smsAnnulation,
  smsAbsence,
  smsCode,
  VERSION_CONSENTEMENT,
} from "./sms-text.js";

const KEY = "jasmins.rdv.v1";
const DATA_VERSION = 5;
const DUREE_HOLD_MIN = 10;

let state = null;
const abonnes = new Set();
let memoireSeule = false;

export class ErreurMetier extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/* Persistance                                                         */

function lireStockage() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    memoireSeule = true;
    return null;
  }
}

function ecrireStockage(valeur) {
  try {
    localStorage.setItem(KEY, valeur);
  } catch {
    memoireSeule = true;
  }
}

function persister() {
  ecrireStockage(JSON.stringify(state));
}

function notifier() {
  abonnes.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error(err);
    }
  });
}

export function subscribe(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

export function initDb() {
  if (state) return state;
  let charge = null;
  const brut = lireStockage();
  if (brut) {
    try {
      const parsed = JSON.parse(brut);
      if (parsed && parsed.version === DATA_VERSION && parsed.seedDate === todayISO()) {
        charge = parsed;
      }
    } catch {
      charge = null;
    }
  }
  state = charge || creerSeed();
  // Champs ajoutés après une première version du stockage.
  state.holds = state.holds || [];
  state.seq = state.seq || { patient: 30, rdv: 25, sms: 100, journal: 10, consent: 12 };
  purgerHolds(false);
  persister();

  window.addEventListener("storage", (event) => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      const nouveau = JSON.parse(event.newValue);
      if (nouveau && nouveau.version === DATA_VERSION) {
        state = nouveau;
        notifier();
      }
    } catch {
      /* ignore */
    }
  });

  return state;
}

export function getState() {
  if (!state) initDb();
  return state;
}

export function resetDemo() {
  state = creerSeed();
  persister();
  notifier();
  return state;
}

export function estMemoireSeule() {
  return memoireSeule;
}

function mutation(fn) {
  const resultat = fn(getState());
  persister();
  notifier();
  return resultat;
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */

export function maintenantISO() {
  return new Date().toISOString();
}

function idSuivant(cle, prefixe, largeur) {
  const s = getState();
  s.seq[cle] = (s.seq[cle] || 0) + 1;
  return `${prefixe}-${String(s.seq[cle]).padStart(largeur, "0")}`;
}

function jeton() {
  const s = getState();
  let code;
  do {
    code = Math.random().toString(36).slice(2, 8);
  } while (s.rendezVous.some((r) => r.token === code));
  return code;
}

export function specialite(id) {
  return getState().specialites.find((s) => s.id === id);
}

export function medecin(id) {
  return getState().medecins.find((m) => m.id === id);
}

export function patient(id) {
  return getState().patients.find((p) => p.id === id);
}

export function rdv(id) {
  return getState().rendezVous.find((r) => r.id === id);
}

export function rdvParToken(token) {
  return getState().rendezVous.find((r) => r.token === token);
}

export function medecinsDeSpecialite(specialiteId) {
  return getState().medecins.filter((m) => !specialiteId || m.specialite_id === specialiteId);
}

export function utilisateursDemo() {
  const s = getState();
  return [
    ...s.users,
    ...s.medecins.map((m) => ({
      id: `usr-${m.id}`,
      nom: m.nom,
      role: "medecin",
      medecinId: m.id,
      specialite_id: m.specialite_id,
    })),
  ];
}

export function utilisateurParId(id) {
  return utilisateursDemo().find((u) => u.id === id);
}

export function libelleMedecin(m) {
  return m ? m.nom : "";
}

export function libelleSpecialite(s) {
  return s ? s.nom_fr : "";
}

/* ------------------------------------------------------------------ */
/* Journal des accès                                                   */

export function logAcces({ utilisateur, role, action, patientId = null, details = "" }, { silencieux = true } = {}) {
  const s = getState();
  const entree = {
    id: idSuivant("journal", "acc", 4),
    horodatage: maintenantISO(),
    utilisateur,
    role,
    action,
    patient_id: patientId,
    details,
  };
  s.journal.unshift(entree);
  persister();
  if (!silencieux) notifier();
  return entree;
}

export function consulterPatient(patientId, utilisateur) {
  logAcces({
    utilisateur: utilisateur.nom,
    role: utilisateur.role,
    action: "consultation",
    patientId,
    details: utilisateur.role === "patient" ? "Consultation de son propre dossier" : "Consultation du dossier",
  });
  return patient(patientId);
}

export function journalFiltre({ utilisateurId, action, patientId, du, au } = {}) {
  return getState().journal.filter((e) => {
    if (utilisateurId && e.utilisateur !== utilisateurId) return false;
    if (action && e.action !== action) return false;
    if (patientId && e.patient_id !== patientId) return false;
    if (du && e.horodatage.slice(0, 10) < du) return false;
    if (au && e.horodatage.slice(0, 10) > au) return false;
    return true;
  });
}

export function journalUtilisateurs() {
  return [...new Set(getState().journal.map((e) => e.utilisateur))].sort((a, b) => a.localeCompare(b));
}

/* ------------------------------------------------------------------ */
/* Consentements                                                       */

export function consentementPatient(patientId) {
  const liste = getState().consentements.filter((c) => c.patient_id === patientId);
  if (!liste.length) return null;
  return liste.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

export function aConsenti(patientId) {
  return Boolean(consentementPatient(patientId));
}

export function texteConsentement(lang) {
  const s = getState();
  return s.consentementsTextes?.[lang] || s.consentementsTextes?.fr || "";
}

export function versionConsentement() {
  return getState().consentementsTextes?.version || VERSION_CONSENTEMENT;
}

export function ajouterConsentement(patientId, lang, utilisateur) {
  return mutation((s) => {
    const p = s.patients.find((x) => x.id === patientId);
    if (!p) throw new ErreurMetier("patient_inconnu");
    const existant = s.consentements.find((c) => c.patient_id === patientId && c.version === versionConsentement());
    if (existant) return existant;
    const c = {
      id: idSuivant("consent", "con", 3),
      patient_id: patientId,
      version: versionConsentement(),
      date: maintenantISO(),
      langue: lang || p.langue,
    };
    s.consentements.push(c);
    logAcces({
      utilisateur: utilisateur?.nom || `${p.prenom} ${p.nom}`,
      role: utilisateur?.role || "patient",
      action: "consentement",
      patientId,
      details: `Consentement ${c.version}`,
    });
    return c;
  });
}

/* ------------------------------------------------------------------ */
/* Créneaux : occupation                                               */

export function purgerHolds(notify = false) {
  const s = getState();
  const avant = s.holds.length;
  const maintenant = Date.now();
  s.holds = s.holds.filter((h) => new Date(h.expire_le).getTime() > maintenant);
  if (avant !== s.holds.length) {
    persister();
    if (notify) notifier();
  }
}

export function holdDuCreneau(slotId) {
  purgerHolds(false);
  return getState().holds.find((h) => h.creneau_id === slotId) || null;
}

export function holdActifDuPatient(patientId) {
  purgerHolds(false);
  return getState().holds.find((h) => h.patient_id === patientId) || null;
}

export function poserHold(slotId, patientId) {
  return mutation((s) => {
    const slot = creneauDeId(slotId);
    if (!slot || !heuresDuJour(slot.date).includes(slot.heure)) throw new ErreurMetier("creneau_inconnu");
    if (estDansLePasse(slot.date, slot.heure)) throw new ErreurMetier("creneau_passe");
    if (s.rendezVous.some((r) => r.creneau_id === slotId && r.statut === "reserve")) {
      throw new ErreurMetier("creneau_pris");
    }
    const maintenant = Date.now();
    s.holds = s.holds.filter((h) => new Date(h.expire_le).getTime() > maintenant);

    const autre = s.holds.find((h) => h.creneau_id === slotId && h.patient_id !== patientId);
    if (autre) throw new ErreurMetier("creneau_en_cours");

    // Un patient ne peut tenir qu'un créneau à la fois.
    s.holds = s.holds.filter((h) => h.patient_id !== patientId);
    const hold = {
      creneau_id: slotId,
      patient_id: patientId,
      expire_le: new Date(maintenant + DUREE_HOLD_MIN * 60 * 1000).toISOString(),
    };
    s.holds.push(hold);
    return hold;
  });
}

export function libererHold(slotId, patientId) {
  return mutation((s) => {
    const avant = s.holds.length;
    s.holds = s.holds.filter((h) => !(h.creneau_id === slotId && (!patientId || h.patient_id === patientId)));
    return avant !== s.holds.length;
  });
}

export function etatCreneau(slotId, patientId = null) {
  const s = getState();
  const slot = creneauDeId(slotId);
  if (!slot) return "inconnu";
  if (s.rendezVous.some((r) => r.creneau_id === slotId && r.statut === "reserve")) return "pris";
  const hold = holdDuCreneau(slotId);
  if (hold) return hold.patient_id === patientId ? "mien" : "en_cours";
  if (estDansLePasse(slot.date, slot.heure)) return "passe";
  if (indisponible(slot.medecinId, slot.date, slot.heure)) return "bloque";
  return "libre";
}

/* ------------------------------------------------------------------ */
/* Indisponibilités                                                    */

export function indisponible(medecinId, date, heure) {
  const s = getState();
  const debut = new Date(`${date}T${heure}:00`);
  return s.indisponibilites.some((ind) => {
    if (ind.medecin_id !== medecinId) return false;
    const dansPlageDate =
      ind.recurrence === "hebdo"
        ? date >= ind.date && date <= (ind.date_fin || ind.date) && parseISODate(date).getDay() === parseISODate(ind.date).getDay()
        : date === ind.date;
    if (!dansPlageDate) return false;
    if (ind.journee) return true;
    const h = debut.getHours() * 60 + debut.getMinutes();
    const [h1, m1] = ind.heure_debut.split(":").map(Number);
    const [h2, m2] = ind.heure_fin.split(":").map(Number);
    return h >= h1 * 60 + m1 && h < h2 * 60 + m2;
  });
}

export function indisponibilitesMedecin(medecinId, inclurePassees = false) {
  const aujourdhui = todayISO();
  return getState()
    .indisponibilites.filter((i) => i.medecin_id === medecinId && (inclurePassees || (i.date_fin || i.date) >= aujourdhui))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Rendez-vous                                                         */

export function rdvActifDeCreneau(slotId) {
  return getState().rendezVous.find((r) => r.creneau_id === slotId && r.statut === "reserve") || null;
}

export function rdvDuPatient(patientId) {
  return getState()
    .rendezVous.filter((r) => r.patient_id === patientId)
    .sort((a, b) => `${b.date}${b.heure}`.localeCompare(`${a.date}${a.heure}`));
}

export function prochainRdv(patientId) {
  const maintenant = new Date();
  return (
    getState()
      .rendezVous.filter((r) => r.patient_id === patientId && r.statut === "reserve" && new Date(`${r.date}T${r.heure}:00`) > maintenant)
      .sort((a, b) => `${a.date}${a.heure}`.localeCompare(`${b.date}${b.heure}`))[0] || null
  );
}

export function rdvDuJour(date, medecinId = null) {
  return getState()
    .rendezVous.filter(
      (r) => r.date === date && r.statut !== "deplace" && r.statut !== "annule" && (!medecinId || r.medecin_id === medecinId)
    )
    .sort((a, b) => a.heure.localeCompare(b.heure));
}

export function rdvAnnulesDuJour(date, medecinId = null) {
  return getState().rendezVous.filter(
    (r) => r.date === date && r.statut === "annule" && (!medecinId || r.medecin_id === medecinId)
  );
}

export function nombreDeplacements(groupe) {
  const liste = getState().rendezVous.filter((r) => r.groupe === groupe);
  return Math.max(0, ...liste.map((r) => r.deplacements || 0));
}

export function creerRdv({
  patientId,
  creneauId: slotId,
  motif,
  canal = "web",
  consentementId = null,
  utilisateur,
  role,
}) {
  return mutation((s) => {
    const p = s.patients.find((x) => x.id === patientId);
    if (!p) throw new ErreurMetier("patient_inconnu");
    const slot = creneauDeId(slotId);
    if (!slot || !heuresDuJour(slot.date).includes(slot.heure)) throw new ErreurMetier("creneau_inconnu");
    if (estDansLePasse(slot.date, slot.heure)) throw new ErreurMetier("creneau_passe");

    // Contrainte d'unicité : un seul rendez-vous actif par créneau.
    if (s.rendezVous.some((r) => r.creneau_id === slotId && r.statut === "reserve")) {
      throw new ErreurMetier("creneau_pris");
    }
    const hold = s.holds.find((h) => h.creneau_id === slotId && new Date(h.expire_le) > new Date());
    if (hold && hold.patient_id !== patientId) throw new ErreurMetier("creneau_en_cours");

    const med = s.medecins.find((m) => m.id === slot.medecinId);
    const spec = s.specialites.find((x) => x.id === med.specialite_id);
    if (!med || !spec) throw new ErreurMetier("creneau_inconnu");

    const identifiant = idSuivant("rdv", "rdv", 3);
    const nouveau = {
      id: identifiant,
      groupe: identifiant,
      token: jeton(),
      patient_id: patientId,
      medecin_id: med.id,
      specialite_id: spec.id,
      creneau_id: slotId,
      date: slot.date,
      heure: slot.heure,
      motif: motif || "",
      statut: "reserve",
      canal,
      cree_le: maintenantISO(),
      modifie_le: maintenantISO(),
      deplacements: 0,
      consentement_id: consentementId,
    };
    s.rendezVous.push(nouveau);
    s.holds = s.holds.filter((h) => h.creneau_id !== slotId);

    programmerConfirmation(s, nouveau, p, med, spec);
    logAcces({
      utilisateur: utilisateur?.nom || `${p.prenom} ${p.nom}`,
      role: role || "patient",
      action: "reservation",
      patientId,
      details: `${spec.nom_fr} — ${slot.date} ${slot.heure} (${canal})`,
    });
    return nouveau;
  });
}

function programmationRappels(s, rdvCree, p, med) {
  const rappels = calculerRappels({ date: rdvCree.date, heure: rdvCree.heure }, new Date());
  for (const r of rappels) {
    const contenu =
      r.type === "rappel_veille"
        ? finaliser(
            smsRappelVeille({
              medecin: med,
              date: rdvCree.date,
              heure: rdvCree.heure,
              etage: med.etage,
              token: rdvCree.token,
              lang: p.langue,
            }),
            p.langue
          )
        : finaliser(
            smsRappel3h({ medecin: med, heure: rdvCree.heure, etage: med.etage, token: rdvCree.token, lang: p.langue }),
            p.langue
          );
    ajouterSmsInterne(s, {
      patient: p,
      type: r.type,
      langue: p.langue,
      statut: "planifie",
      envoi_prevu: r.quand.toISOString(),
      contenu,
      rdv_id: rdvCree.id,
    });
  }
}

function programmerConfirmation(s, rdvCree, p, med, spec) {
  const contenu = finaliser(
    smsConfirmation({
      patient: p,
      medecin: med,
      specialite: spec,
      date: rdvCree.date,
      heure: rdvCree.heure,
      etage: med.etage,
      token: rdvCree.token,
      lang: p.langue,
    }),
    p.langue
  );
  ajouterSmsInterne(s, {
    patient: p,
    type: "confirmation",
    langue: p.langue,
    statut: "envoye",
    envoi_prevu: maintenantISO(),
    envoye_le: maintenantISO(),
    contenu,
    rdv_id: rdvCree.id,
  });
  programmationRappels(s, rdvCree, p, med);
}

function ajouterSmsInterne(s, { patient: p, type, langue, statut, envoi_prevu, envoye_le = null, contenu, rdv_id }) {
  const sms = {
    id: idSuivant("sms", "sms", 3),
    patient_id: p.id,
    tel: p.mobile,
    type,
    langue,
    statut,
    envoi_prevu,
    envoye_le,
    contenu,
    rdv_id,
  };
  s.sms.push(sms);
  return sms;
}

export function annulerRdv(rdvId, { utilisateur, role, source = "application", ignorerDelai = false } = {}) {
  return mutation((s) => {
    const r = s.rendezVous.find((x) => x.id === rdvId);
    if (!r) throw new ErreurMetier("rdv_inconnu");
    if (r.statut === "annule") throw new ErreurMetier("deja_annule");
    if (r.statut !== "reserve") throw new ErreurMetier("rdv_non_annulable");
    const debut = new Date(`${r.date}T${r.heure}:00`);
    if (!ignorerDelai && debut.getTime() - Date.now() < 4 * 60 * 60 * 1000) {
      throw new ErreurMetier("trop_tard");
    }
    const p = s.patients.find((x) => x.id === r.patient_id);
    const med = s.medecins.find((m) => m.id === r.medecin_id);
    r.statut = "annule";
    r.modifie_le = maintenantISO();
    s.holds = s.holds.filter((h) => h.creneau_id !== r.creneau_id);
    annulerSmsPlanifies(s, r.id);
    if (p && med) {
      ajouterSmsInterne(s, {
        patient: p,
        type: "annulation",
        langue: p.langue,
        statut: "envoye",
        envoi_prevu: maintenantISO(),
        envoye_le: maintenantISO(),
        contenu: finaliser(smsAnnulation({ date: r.date, heure: r.heure, medecin: med, lang: p.langue }), p.langue),
        rdv_id: r.id,
      });
    }
    logAcces({
      utilisateur: utilisateur?.nom || "Patient",
      role: role || "patient",
      action: "annulation",
      patientId: r.patient_id,
      details: `${r.date} ${r.heure} — ${source}`,
    });
    return r;
  });
}

function annulerSmsPlanifies(s, rdvId) {
  for (const sms of s.sms) {
    if (sms.rdv_id === rdvId && sms.statut === "planifie") sms.statut = "annule";
  }
}

export function deplacerRdv(rdvId, nouveauCreneauId, { utilisateur, role } = {}) {
  return mutation((s) => {
    const ancien = s.rendezVous.find((x) => x.id === rdvId);
    if (!ancien) throw new ErreurMetier("rdv_inconnu");
    if (ancien.statut !== "reserve") throw new ErreurMetier("rdv_non_deplacable");
    if ((ancien.deplacements || 0) >= 2) throw new ErreurMetier("limite_deplacements");

    const slot = creneauDeId(nouveauCreneauId);
    if (!slot || !heuresDuJour(slot.date).includes(slot.heure)) throw new ErreurMetier("creneau_inconnu");
    if (estDansLePasse(slot.date, slot.heure)) throw new ErreurMetier("creneau_passe");
    if (s.rendezVous.some((r) => r.creneau_id === nouveauCreneauId && r.statut === "reserve" && r.id !== rdvId)) {
      throw new ErreurMetier("creneau_pris");
    }
    const med = s.medecins.find((m) => m.id === slot.medecinId);
    const spec = s.specialites.find((x) => x.id === med.specialite_id);
    const p = s.patients.find((x) => x.id === ancien.patient_id);

    // L'ancien créneau n'est libéré qu'une fois le nouveau validé.
    ancien.statut = "deplace";
    ancien.modifie_le = maintenantISO();
    annulerSmsPlanifies(s, ancien.id);

    const nouveau = {
      ...ancien,
      id: idSuivant("rdv", "rdv", 3),
      token: jeton(),
      medecin_id: med.id,
      specialite_id: spec.id,
      creneau_id: nouveauCreneauId,
      date: slot.date,
      heure: slot.heure,
      statut: "reserve",
      cree_le: maintenantISO(),
      modifie_le: maintenantISO(),
      deplacements: (ancien.deplacements || 0) + 1,
      ancien_creneau_id: ancien.creneau_id,
    };
    s.rendezVous.push(nouveau);
    s.holds = s.holds.filter((h) => h.creneau_id !== nouveauCreneauId);

    programmerConfirmation(s, nouveau, p, med, spec);
    logAcces({
      utilisateur: utilisateur?.nom || `${p.prenom} ${p.nom}`,
      role: role || "patient",
      action: "deplacement",
      patientId: p.id,
      details: `${ancien.date} ${ancien.heure} → ${slot.date} ${slot.heure}`,
    });
    return nouveau;
  });
}

export function pointerRdv(rdvId, statut, utilisateur) {
  if (!["present", "retard", "absent", "reserve"].includes(statut)) throw new ErreurMetier("statut_invalide");
  return mutation((s) => {
    const r = s.rendezVous.find((x) => x.id === rdvId);
    if (!r) throw new ErreurMetier("rdv_inconnu");
    const avant = r.statut;
    r.statut = statut;
    r.modifie_le = maintenantISO();
    logAcces({
      utilisateur: utilisateur?.nom || "Accueil",
      role: utilisateur?.role || "secretaire",
      action: "pointage",
      patientId: r.patient_id,
      details: `${r.date} ${r.heure} : ${avant} → ${statut}`,
    });
    return r;
  });
}

export function tauxNoShow() {
  const maintenant = new Date();
  const passes = getState().rendezVous.filter(
    (r) => ["present", "retard", "absent"].includes(r.statut) && new Date(`${r.date}T${r.heure}:00`) < maintenant
  );
  const absents = passes.filter((r) => r.statut === "absent").length;
  return { absents, total: passes.length, taux: passes.length ? absents / passes.length : 0 };
}

export function rdvImpactesParIndisponibilite({ medecinId, date, date_fin, recurrence, journee, heure_debut, heure_fin }) {
  return getState().rendezVous.filter((r) => {
    if (r.medecin_id !== medecinId || r.statut !== "reserve") return false;
    if (recurrence === "hebdo") {
      if (r.date < date || r.date > date_fin) return false;
      if (parseISODate(r.date).getDay() !== parseISODate(date).getDay()) return false;
    } else if (r.date !== date) {
      return false;
    }
    if (journee) return true;
    return r.heure >= heure_debut && r.heure < heure_fin;
  });
}

export function creerIndisponibilite({ medecinId, date, date_fin, recurrence, journee, heure_debut, heure_fin, motif }, utilisateur) {
  const impactes = rdvImpactesParIndisponibilite({
    medecinId,
    date,
    date_fin,
    recurrence,
    journee,
    heure_debut,
    heure_fin,
  });
  const resultat = mutation((s) => {
    const ind = {
      id: idSuivant("indispo", "ind", 3),
      medecin_id: medecinId,
      date,
      date_fin: recurrence === "hebdo" ? date_fin : date,
      recurrence,
      journee,
      heure_debut: journee ? "08:30" : heure_debut,
      heure_fin: journee ? "18:00" : heure_fin,
      motif,
      cree_le: maintenantISO(),
    };
    s.indisponibilites.push(ind);

    for (const r of impactes) {
      const p = s.patients.find((x) => x.id === r.patient_id);
      const med = s.medecins.find((m) => m.id === r.medecin_id);
      r.statut = "annule";
      r.modifie_le = maintenantISO();
      annulerSmsPlanifies(s, r.id);
      if (p && med) {
        ajouterSmsInterne(s, {
          patient: p,
          type: "absence",
          langue: p.langue,
          statut: "envoye",
          envoi_prevu: maintenantISO(),
          envoye_le: maintenantISO(),
          contenu: finaliser(
            smsAbsence({ medecin: med, date: r.date, heure: r.heure, token: r.token, lang: p.langue }),
            p.langue
          ),
          rdv_id: r.id,
        });
      }
    }
    logAcces({
      utilisateur: utilisateur?.nom || "Médecin",
      role: utilisateur?.role || "medecin",
      action: "blocage",
      patientId: null,
      details: `${date}${recurrence === "hebdo" ? ` → ${date_fin} (hebdomadaire)` : ""} ${
        journee ? "journée" : `${heure_debut}-${heure_fin}`
      } — ${motif || "absence"} ; ${impactes.length} RDV annulé(s)`,
    });
    return { indisponibilite: ind, impactes: impactes.length };
  });
  return resultat;
}

export function supprimerIndisponibilite(id, utilisateur) {
  return mutation((s) => {
    const ind = s.indisponibilites.find((i) => i.id === id);
    s.indisponibilites = s.indisponibilites.filter((i) => i.id !== id);
    if (ind) {
      logAcces({
        utilisateur: utilisateur?.nom || "Médecin",
        role: utilisateur?.role || "medecin",
        action: "blocage",
        patientId: null,
        details: `Blocage levé : ${ind.date} ${ind.journee ? "journée" : ind.heure_debut + "-" + ind.heure_fin}`,
      });
    }
    return ind;
  });
}

/* ------------------------------------------------------------------ */
/* Patients                                                            */

export function patientParMobile(mobile) {
  const normalise = String(mobile || "").replace(/\s/g, "");
  return getState().patients.find((p) => p.mobile === normalise) || null;
}

export function creerPatient({ prenom, nom, mobile, naissance = "", adresse = "", email = "", langue = "fr", source = "web" }) {
  return mutation((s) => {
    const p = {
      id: idSuivant("patient", "pat", 3),
      prenom: prenom.trim(),
      nom: nom.trim(),
      mobile: String(mobile).replace(/\s/g, ""),
      naissance,
      adresse,
      email,
      langue,
      variantes: [],
      source,
      cree_le: maintenantISO(),
    };
    s.patients.push(p);
    return p;
  });
}

export function majPatient(patientId, changements, utilisateur) {
  return mutation((s) => {
    const p = s.patients.find((x) => x.id === patientId);
    if (!p) throw new ErreurMetier("patient_inconnu");
    const traces = [];
    for (const [cle, valeur] of Object.entries(changements)) {
      if (!(cle in p)) continue;
      if (String(p[cle] ?? "") === String(valeur ?? "")) continue;
      traces.push(`${cle}: "${p[cle] || "—"}" → "${valeur || "—"}"`);
      p[cle] = valeur;
    }
    if (traces.length) {
      logAcces({
        utilisateur: utilisateur?.nom || `${p.prenom} ${p.nom}`,
        role: utilisateur?.role || "patient",
        action: "modification",
        patientId,
        details: traces.join(" ; "),
      });
      if (changements.langue) {
        for (const sms of s.sms) {
          if (sms.patient_id === patientId && sms.statut === "planifie") {
            sms.langue = changements.langue;
            const r = s.rendezVous.find((x) => x.id === sms.rdv_id);
            if (r) {
              const med = s.medecins.find((m) => m.id === r.medecin_id);
              const contenu =
                sms.type === "rappel_veille"
                  ? smsRappelVeille({ medecin: med, date: r.date, heure: r.heure, etage: med.etage, token: r.token, lang: p.langue })
                  : smsRappel3h({ medecin: med, heure: r.heure, etage: med.etage, token: r.token, lang: p.langue });
              sms.contenu = finaliser(contenu, p.langue);
            }
          }
        }
      }
    }
    return { patient: p, traces };
  });
}

/* ------------------------------------------------------------------ */
/* Recherche de disponibilités                                         */

export function creneauxDisponibles({
  specialiteId = "",
  medecinId = "",
  dateDebut = todayISO(),
  jours = 14,
  patientId = null,
} = {}) {
  const s = getState();
  const filtreMedecins = s.medecins.filter(
    (m) => (!specialiteId || m.specialite_id === specialiteId) && (!medecinId || m.id === medecinId)
  );
  const occupes = new Set(
    s.rendezVous.filter((r) => r.statut === "reserve").map((r) => r.creneau_id)
  );
  purgerHolds(false);
  const holds = new Map(s.holds.map((h) => [h.creneau_id, h]));
  const debut = dateDebut < todayISO() ? todayISO() : dateDebut;
  const resultat = [];

  for (let i = 0; i < jours; i += 1) {
    const date = addDaysISO(debut, i);
    if (!estJourOuvre(date)) continue;
    const jour = { date, creneaux: [] };
    for (const m of filtreMedecins) {
      for (const heure of heuresDuJour(date)) {
        const id = creneauId(m.id, date, heure);
        if (estDansLePasse(date, heure)) continue;
        if (occupes.has(id)) continue;
        if (indisponible(m.id, date, heure)) continue;
        const hold = holds.get(id);
        if (hold && hold.patient_id !== patientId) continue;
        jour.creneaux.push({ id, medecinId: m.id, date, heure, debut: new Date(`${date}T${heure}:00`) });
      }
    }
    if (jour.creneaux.length) {
      jour.creneaux.sort((a, b) => a.heure.localeCompare(b.heure) || a.medecinId.localeCompare(b.medecinId));
      resultat.push(jour);
    }
  }
  return resultat;
}

export function compterDisponibles(filtres) {
  return creneauxDisponibles(filtres).reduce((n, j) => n + j.creneaux.length, 0);
}

export function smsDuRdv(rdvId) {
  return getState().sms.filter((s) => s.rdv_id === rdvId);
}

export function journalSms({ type = "", statut = "", patientId = "" } = {}) {
  return getState()
    .sms.filter((s) => {
      if (type && s.type !== type) return false;
      if (statut && s.statut !== statut) return false;
      if (patientId && s.patient_id !== patientId) return false;
      return true;
    })
    .sort((a, b) => new Date(b.envoi_prevu) - new Date(a.envoi_prevu));
}

export function ajouterSmsCode({ tel, code, langue }) {
  return mutation((s) => {
    const existant = s.patients.find((p) => p.mobile === tel);
    const contenu = finaliser(smsCode({ code, lang: langue }), langue);
    const sms = {
      id: idSuivant("sms", "sms", 3),
      patient_id: existant?.id || null,
      tel,
      type: "code",
      langue,
      statut: "envoye",
      envoi_prevu: maintenantISO(),
      envoye_le: maintenantISO(),
      contenu,
      rdv_id: null,
    };
    s.sms.push(sms);
    return sms;
  });
}

/* ------------------------------------------------------------------ */
/* Moteur SMS simulé                                                   */

export function traiterSmsDus() {
  const maintenant = Date.now();
  let change = false;
  const s = getState();
  for (const sms of s.sms) {
    if (sms.statut !== "planifie") continue;
    if (new Date(sms.envoi_prevu).getTime() > maintenant) continue;
    const r = sms.rdv_id ? s.rendezVous.find((x) => x.id === sms.rdv_id) : null;
    if (r && r.statut !== "reserve") {
      sms.statut = "annule";
      change = true;
      continue;
    }
    sms.statut = "envoye";
    sms.envoye_le = new Date().toISOString();
    change = true;
  }
  if (change) {
    persister();
    notifier();
  }
  purgerHolds(true);
}

