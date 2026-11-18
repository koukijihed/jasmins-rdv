// Parcours patient : recherche, réservation 3 étapes, déplacement, annulation, compte.

import { t, getLang, fmtDate, fmtDateLong, fmtDateTime, setLang } from "../i18n.js";
import { esc, badge, toast, nomComplet, age, minutesRestantes, nomMedecin, etageTexte, motifTexte } from "../ui.js";
import { naviguer, rerendre } from "../router.js";
import {
  getState,
  patient as trouverPatient,
  medecin as trouverMedecin,
  specialite as trouverSpecialite,
  rdv as trouverRdv,
  prochainRdv,
  rdvDuPatient,
  creneauxDisponibles,
  poserHold,
  libererHold,
  holdDuCreneau,
  aConsenti,
  consentementPatient,
  ajouterConsentement,
  creerRdv,
  annulerRdv,
  deplacerRdv,
  majPatient,
  consulterPatient,
  texteConsentement,
  versionConsentement,
  smsDuRdv,
  patientParMobile,
  ErreurMetier,
} from "../db.js";
import { todayISO, addDaysISO, creneauDeId } from "../slots.js";
import { majSessionPatient } from "../auth.js";

const etat = {
  specialite: "",
  medecin: "",
  date: todayISO(),
  joursAffiches: 7,
  expands: {},
  slotId: "",
  etape: 2,
  motif: "",
  motifAutre: "",
  consentement: false,
  erreur: "",
  annulerId: "",
  deplacerId: "",
  deplacerSlot: "",
  compteMessage: "",
  compteErreur: "",
  dernierLog: "",
};

const MOTIF_AUTRE = "__autre__";

function nomSpecialite(s) {
  if (!s) return "";
  return getLang() === "ar" ? s.nom_ar : s.nom_fr;
}

function specDe(rdvItem) {
  return trouverSpecialite(rdvItem.specialite_id);
}

function medDe(rdvItem) {
  return trouverMedecin(rdvItem.medecin_id);
}

function particulier(rdvItem) {
  if (!rdvItem) return "—";
  return etageTexte(medDe(rdvItem)?.etage) || "—";
}

function messageErreur(err) {
  if (!(err instanceof ErreurMetier)) return t("common.error");
  const carte = {
    trop_tard: "p.cancel.tooLate",
    creneau_pris: "p.slotTaken",
    creneau_en_cours: "p.slotTaken",
    creneau_passe: "p.slotTaken",
    creneau_inconnu: "p.slotTaken",
    limite_deplacements: "p.move.limit",
    hold_expire: "p.hold.expired",
    rdv_non_annulable: "p.cancel.tooLate",
    rdv_non_deplacable: "p.move.limit",
  };
  return carte[err.code] ? t(carte[err.code]) : t("common.error");
}

function steps(actif) {
  return `<ol class="steps" aria-label="${esc(t("p.book"))}">
    ${[1, 2, 3]
      .map((n) => {
        const label = t(`p.step${n}`);
        const etatClasse = n < actif ? "done" : "";
        return `<li class="${etatClasse}" ${n === actif ? 'aria-current="step"' : ""}><span>${esc(label)}</span></li>`;
      })
      .join("")}
  </ol>`;
}

function entete(titre, sousTitre, { retour = null, actions = "" } = {}) {
  return `
    <div class="page-head">
      <div class="page-head__text">
        ${retour ? `<a class="linkish small" href="${retour}">← ${esc(t("common.back"))}</a>` : ""}
        <h1 style="margin-top:${retour ? "8px" : "0"}">${esc(titre)}</h1>
        ${sousTitre ? `<p class="muted" style="margin:4px 0 0">${esc(sousTitre)}</p>` : ""}
      </div>
      ${actions ? `<div class="page-head__actions">${actions}</div>` : ""}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Accueil patient                                                     */

function carteProchain(rdvItem) {
  const med = medDe(rdvItem);
  const spec = specDe(rdvItem);
  const maintenant = new Date();
  const debut = new Date(`${rdvItem.date}T${rdvItem.heure}:00`);
  const dansQuatreHeures = debut.getTime() - maintenant.getTime() >= 4 * 3600 * 1000;

  return `
    <article class="card card--accent">
      <div class="card__head">
        <div>
          <p class="eyebrow">${esc(t("p.next"))}</p>
          <h2>${esc(fmtDateLong(rdvItem.date))} — ${esc(rdvItem.heure)}</h2>
        </div>
        ${badge(rdvItem.statut)}
      </div>
      <p class="strong" style="margin-bottom:2px">${esc(nomMedecin(med))} · ${esc(nomSpecialite(spec))}</p>
      <p class="muted small" style="margin-bottom:2px">${esc(particulier(rdvItem))} · ${esc(t("p.duration.value"))}</p>
      ${rdvItem.motif ? `<p class="small" style="margin-top:8px"><span class="muted">${esc(t("s.reason"))} :</span> ${esc(motifTexte(rdvItem.motif, spec))}</p>` : ""}
      <div class="alert alert--info" style="margin-top:12px">${esc(t("p.bring"))}</div>
      <div class="row" style="margin-top:4px">
        <button class="btn btn--secondary" type="button" data-deplacer="${rdvItem.id}"
          ${(rdvItem.deplacements || 0) >= 2 ? "disabled" : ""}>${esc(t("p.move"))}</button>
        <button class="btn btn--ghost" type="button" data-annuler="${rdvItem.id}" ${dansQuatreHeures ? "" : "disabled"}>
          ${esc(t("p.cancel"))}
        </button>
      </div>
      ${
        !dansQuatreHeures
          ? `<p class="xs muted" style="margin-top:8px">${esc(t("p.cancel.tooLate.short"))} — ${esc(t("p.cancel.tooLate"))}</p>`
          : ""
      }
      ${
        (rdvItem.deplacements || 0) >= 2
          ? `<p class="xs muted" style="margin-top:8px">${esc(t("p.move.limit"))}</p>`
          : ""
      }
    </article>`;
}

function rendreAccueil(session) {
  const p = trouverPatient(session.patientId);
  if (!p) return `<div class="alert alert--error">${esc(t("common.error"))}</div>`;
  const rdvItem = prochainRdv(p.id);
  const historique = rdvDuPatient(p.id).filter((r) => r.id !== rdvItem?.id).slice(0, 3);

  return `
    ${entete(t("p.hello", { name: p.prenom }), t("p.subtitle"), {
      actions: `<a class="btn" href="#/patient/rechercher">${esc(t("p.book"))}</a>`,
    })}
    ${rdvItem ? carteProchain(rdvItem) : `
      <div class="empty">
        <p class="strong">${esc(t("p.none"))}</p>
        <p class="small muted">${esc(t("p.noneHint"))}</p>
        <a class="btn" href="#/patient/rechercher">${esc(t("p.book"))}</a>
      </div>`}
    <div class="grid grid--2 section">
      <a class="card" href="#/patient/rdv" style="text-decoration:none;color:inherit">
        <h2>${esc(t("p.myAppts"))}</h2>
        <p class="small muted">${esc(t("p.history"))}</p>
      </a>
      <a class="card" href="#/patient/compte" style="text-decoration:none;color:inherit">
        <h2>${esc(t("p.account"))}</h2>
        <p class="small muted">${esc(t("p.account.hint"))}</p>
      </a>
    </div>
    ${historique.length ? `
      <section class="section">
        <h2>${esc(t("p.history"))}</h2>
        <div class="rdv-list" style="margin-top:8px">
          ${historique.map((r) => `
            <div class="rdv">
              <div class="rdv__time">${esc(r.heure)}</div>
              <div class="rdv__main">
                <strong>${esc(fmtDate(r.date))}</strong>
                <span class="rdv__meta">${esc(nomMedecin(medDe(r)))} · ${esc(nomSpecialite(specDe(r)))}</span>
              </div>
              <div class="rdv__actions">${badge(r.statut)}</div>
            </div>`).join("")}
        </div>
      </section>` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Recherche de créneaux                                               */

function rendreFiltres() {
  const s = getState();
  const medecins = s.medecins.filter((m) => !etat.specialite || m.specialite_id === etat.specialite);
  return `
    <form data-form="filtres" class="card card--flat" style="margin-bottom:16px">
      <div class="filters">
        <div class="field">
          <label for="f-specialite">${esc(t("p.specialty"))}</label>
          <select id="f-specialite" name="specialite">
            <option value="">${esc(t("common.all"))}</option>
            ${s.specialites.map((sp) => `<option value="${sp.id}"${sp.id === etat.specialite ? " selected" : ""}>${esc(nomSpecialite(sp))}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-medecin">${esc(t("p.doctor"))}</label>
          <select id="f-medecin" name="medecin">
            <option value="">${esc(t("common.allM"))}</option>
            ${medecins.map((m) => `<option value="${m.id}"${m.id === etat.medecin ? " selected" : ""}>${esc(nomMedecin(m))}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-date">${esc(t("p.dateFrom"))}</label>
          <input id="f-date" name="date" type="date" value="${esc(etat.date)}" min="${todayISO()}" />
        </div>
      </div>
      <button class="btn btn--secondary btn--block" type="submit">${esc(t("p.search"))}</button>
    </form>`;
}

function rendreResultats(session, { mode = "reservation" } = {}) {
  const dispo = creneauxDisponibles({
    specialiteId: etat.specialite,
    medecinId: etat.medecin,
    dateDebut: etat.date,
    jours: 14,
    patientId: session.patientId,
  });

  if (!dispo.length) {
    return `<div class="alert alert--warn">${esc(t("p.noSlot"))}</div>`;
  }

  const jours = dispo.slice(0, etat.joursAffiches);
  const html = jours
    .map((jour) => {
      const parMedecin = new Map();
      for (const c of jour.creneaux) {
        if (!parMedecin.has(c.medecinId)) parMedecin.set(c.medecinId, []);
        parMedecin.get(c.medecinId).push(c);
      }
      const lignes = [...parMedecin.entries()]
        .map(([medecinId, creneaux]) => {
          const m = trouverMedecin(medecinId);
          const cle = `${jour.date}|${medecinId}`;
          const etendu = Boolean(etat.expands[cle]);
          const visibles = etendu ? creneaux : creneaux.slice(0, 4);
          const reste = creneaux.length - visibles.length;
          return `
            <div class="row" style="align-items:flex-start;margin-top:8px">
              <span class="small strong" style="flex:0 0 132px">${esc(nomMedecin(m))}</span>
              <div class="chips" style="flex:1 1 220px">
                ${visibles
                  .map(
                    (c) => `<button class="chip chip--slot" type="button"
                      data-${mode === "deplacement" ? "move-slot" : "slot"}="${esc(c.id)}"
                      aria-label="${esc(c.heure)} — ${esc(nomMedecin(m))}">${esc(c.heure)}</button>`
                  )
                  .join("")}
                ${
                  reste > 0
                    ? `<button class="chip" type="button" data-expand="${esc(cle)}">${esc(t("p.moreSlots", { n: reste }))}</button>`
                    : etendu && creneaux.length > 4
                    ? `<button class="chip" type="button" data-expand="${esc(cle)}">−</button>`
                    : ""
                }
              </div>
            </div>`;
        })
        .join("");

      return `
        <section class="card card--flat">
          <div class="card__head" style="margin-bottom:0">
            <h2 style="font-size:1rem">${esc(fmtDate(jour.date, { weekday: "long" }))}</h2>
            <span class="badge">${esc(t("p.results"))} · ${esc(jour.creneaux.length)}</span>
          </div>
          ${lignes}
        </section>`;
    })
    .join("");

  return `
    <div class="rdv-list">${html}</div>
    ${
      dispo.length > etat.joursAffiches
        ? `<div class="center" style="margin-top:12px">
             <button class="btn btn--secondary" type="button" data-plus-jours>${esc(t("p.results.hint"))}</button>
           </div>`
        : ""
    }`;
}

function rendreRecherche(session) {
  return `
    ${entete(t("p.book"), null, { retour: "#/patient" })}
    ${steps(1)}
    ${rendreFiltres()}
    <p class="small muted">${esc(t("p.results.hint"))}</p>
    <h2 style="margin-top:12px">${esc(t("p.results"))}</h2>
    <div id="resultats">${rendreResultats(session)}</div>`;
}

/* ------------------------------------------------------------------ */
/* Réservation                                                         */

function rendreReservation(session, slotId) {
  const slot = creneauDeId(slotId);
  const p = trouverPatient(session.patientId);
  if (!slot) {
    return `${entete(t("p.book"))}<div class="alert alert--error">${esc(t("p.noSlot"))}</div>`;
  }
  if (etat.slotId !== slotId) {
    etat.slotId = slotId;
    etat.etape = 2;
    etat.motif = "";
    etat.motifAutre = "";
    etat.consentement = false;
    etat.erreur = "";
  }

  const m = trouverMedecin(slot.medecinId);
  const spec = trouverSpecialite(m.specialite_id);
  const hold = holdDuCreneau(slotId);
  const holdOk = hold && hold.patient_id === p.id;
  const consentement = consentementPatient(p.id);

  if (!holdOk) {
    return `
      ${entete(t("p.book"), null, { retour: "#/patient/rechercher" })}
      ${steps(2)}
      <div class="alert alert--error">${esc(t("p.hold.expired"))}</div>
      <a class="btn" href="#/patient/rechercher">${esc(t("p.search"))}</a>`;
  }

  const motifs = getLang() === "ar" ? spec.motifs_ar : spec.motifs_fr;
  const minutes = minutesRestantes(hold);

  const recap = `
    <div class="card card--accent">
      <p class="eyebrow">${esc(t("p.slot"))}</p>
      <h2>${esc(fmtDateLong(slot.date))}</h2>
      <p class="strong" style="margin:2px 0">${esc(slot.heure)} · ${esc(nomMedecin(m))}</p>
      <p class="small muted" style="margin:0">${esc(nomSpecialite(spec))} · ${esc(particulier({ medecin_id: m.id }))}</p>
    </div>
    <div class="alert alert--info" style="margin-top:12px">${esc(t("p.hold", { min: minutes }))}</div>`;

  if (etat.etape === 2) {
    return `
      ${entete(t("p.book"), null, { retour: "#/patient/rechercher" })}
      ${steps(2)}
      ${recap}
      ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
      <form data-form="motif" class="card" style="margin-top:12px">
        <h2>${esc(t("p.motif.title"))}</h2>
        <p class="small muted">${esc(t("p.motif.hint"))}</p>
        <div class="stack" role="radiogroup" aria-label="${esc(t("p.motif.title"))}">
          ${motifs
            .map(
              (motif, index) => `
              <label class="check" style="cursor:pointer">
                <input type="radio" name="motif" value="${esc(motif)}" ${etat.motif === motif ? "checked" : ""} id="motif-${index}" />
                <span>${esc(motif)}</span>
              </label>`
            )
            .join("")}
          <label class="check" style="cursor:pointer">
            <input type="radio" name="motif" value="${MOTIF_AUTRE}" ${etat.motif === MOTIF_AUTRE ? "checked" : ""} id="motif-autre" />
            <span>${esc(t("p.motif.other"))}</span>
          </label>
        </div>
        <div class="field" style="margin-top:12px">
          <label for="motif-texte">${esc(t("p.motif.placeholder"))}</label>
          <input id="motif-texte" name="motifAutre" type="text" value="${esc(etat.motifAutre)}" placeholder="${esc(t("p.motif.placeholder"))}" />
        </div>
        <button class="btn btn--block" type="submit">${esc(t("common.next"))}</button>
      </form>`;
  }

  return `
    ${entete(t("p.book"), null, { retour: "#/patient/rechercher" })}
    ${steps(3)}
    ${recap}
    ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
    <div class="card" style="margin-top:12px">
      <h2>${esc(t("p.summary"))}</h2>
      <div class="log-grid">
        <p class="kv"><span class="kv__k">${esc(t("s.patient"))}</span><span class="kv__v">${esc(nomComplet(p))}</span></p>
        <p class="kv"><span class="kv__k">${esc(t("p.slot"))}</span><span class="kv__v">${esc(fmtDateLong(slot.date))} · ${esc(slot.heure)}</span></p>
        <p class="kv"><span class="kv__k">${esc(t("p.doctor"))}</span><span class="kv__v">${esc(nomMedecin(m))}</span></p>
        <p class="kv"><span class="kv__k">${esc(t("p.motif.title"))}</span><span class="kv__v">${esc(etat.motif === MOTIF_AUTRE ? etat.motifAutre : etat.motif)}</span></p>
      </div>
      ${
        consentement
          ? `<p class="xs muted" style="margin-top:12px">${esc(t("p.consent.given", { date: fmtDateTime(consentement.date), version: consentement.version }))}</p>`
          : `<div class="check" style="margin-top:12px">
               <input id="consentement" type="checkbox" ${etat.consentement ? "checked" : ""} />
               <label for="consentement">${esc(t("p.consent.label"))}</label>
             </div>
             <details style="margin-top:8px">
               <summary class="small linkish" style="cursor:pointer">${esc(t("p.consent.see"))}</summary>
               <p class="xs muted" style="margin-top:8px">${esc(texteConsentement(getLang()))}</p>
               <p class="xs muted">${esc(t("p.consent.given", { date: fmtDate(todayISO()), version: versionConsentement() }))}</p>
             </details>`
      }
      <div class="row" style="margin-top:16px">
        <button class="btn" type="button" data-confirmer>${esc(t("p.confirmBtn"))}</button>
        <button class="btn btn--ghost" type="button" data-retour-etape2>${esc(t("common.back"))}</button>
      </div>
    </div>`;
}

function rendreConfirmation(session, rdvId) {
  const r = trouverRdv(rdvId);
  if (!r || r.patient_id !== session.patientId) {
    return `<div class="alert alert--error">${esc(t("common.error"))}</div>`;
  }
  const m = medDe(r);
  const spec = specDe(r);
  const sms = smsDuRdv(r.id).find((s) => s.type === "confirmation");

  return `
    <div class="alert alert--ok" role="status"><strong>${esc(t("p.booked.title"))}</strong><br/>${esc(t("p.booked"))}</div>
    ${entete(`${esc(fmtDateLong(r.date))} — ${esc(r.heure)}`, `${nomMedecin(m)} · ${nomSpecialite(spec)}`)}
    <div class="card">
      <div class="card__head">
        <div>
          <p class="eyebrow">${esc(t("p.next"))}</p>
          <h2>${esc(nomMedecin(m))}</h2>
        </div>
        ${badge(r.statut)}
      </div>
      <div class="log-grid">
        <p class="kv"><span class="kv__k">${esc(t("p.level"))}</span><span class="kv__v">${esc(etageTexte(m.etage))}</span></p>
        <p class="kv"><span class="kv__k">${esc(t("p.duration"))}</span><span class="kv__v">${esc(t("p.duration.value"))}</span></p>
        <p class="kv"><span class="kv__k">${esc(t("s.reason"))}</span><span class="kv__v">${esc(motifTexte(r.motif, spec) || "—")}</span></p>
        <p class="kv"><span class="kv__k">${esc(t("p.mobile"))}</span><span class="kv__v" dir="ltr">${esc(trouverPatient(r.patient_id)?.mobile || "")}</span></p>
      </div>
      <div class="alert alert--info" style="margin-top:12px">${esc(t("p.bring"))}</div>
      ${sms ? `<h3 style="margin-top:12px">${esc(t("sms.type.confirmation"))}</h3><div class="sms-body">${esc(sms.contenu)}</div>` : ""}
      <div class="row" style="margin-top:12px">
        <a class="small" href="#/annuler/${esc(r.token)}">${esc(t("p.smsLink"))}</a>
      </div>
      <div class="row" style="margin-top:16px">
        <a class="btn" href="#/patient">${esc(t("nav.home"))}</a>
        <a class="btn btn--secondary" href="#/patient/rdv">${esc(t("p.myAppts"))}</a>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Mes rendez-vous                                                     */

function ligneRdv(r, session) {
  const m = medDe(r);
  const spec = specDe(r);
  const futur = new Date(`${r.date}T${r.heure}:00`) > new Date();
  const annulable = r.statut === "reserve" && futur && new Date(`${r.date}T${r.heure}:00`) - Date.now() >= 4 * 3600 * 1000;
  const deplacable = r.statut === "reserve" && futur && (r.deplacements || 0) < 2;
  const ouvert = etat.annulerId === r.id;

  return `
    <div class="rdv">
      <div class="rdv__time">${esc(r.heure)}</div>
      <div class="rdv__main">
        <strong>${esc(fmtDateLong(r.date))}</strong>
        <span class="rdv__meta">${esc(nomMedecin(m))} · ${esc(nomSpecialite(spec))} · ${esc(t(`canal.${r.canal}`))}</span>
        ${(r.deplacements || 0) > 0 ? `<span class="rdv__meta">${esc(t("p.move.left", { n: 2 - (r.deplacements || 0) }))}</span>` : ""}
      </div>
      <div class="rdv__actions">
        ${badge(r.statut)}
        ${deplacable ? `<button class="btn btn--small btn--secondary" type="button" data-deplacer="${r.id}">${esc(t("p.move"))}</button>` : ""}
        ${r.statut === "reserve" && futur ? `<button class="btn btn--small btn--ghost" type="button" data-annuler="${r.id}" ${annulable ? "" : "disabled"}>${esc(t("common.cancel"))}</button>` : ""}
      </div>
      ${ouvert ? `
        <div class="alert alert--warn" style="flex:1 1 100%;margin:8px 0 0">
          <p class="small" style="margin-bottom:8px">${esc(t("p.cancel.confirm"))}</p>
          <div class="row">
            <button class="btn btn--small btn--danger" type="button" data-confirm-cancel="${r.id}">${esc(t("common.confirm"))}</button>
            <button class="btn btn--small btn--secondary" type="button" data-abort-cancel>${esc(t("common.close"))}</button>
          </div>
        </div>` : ""}
      ${r.statut === "reserve" && futur && !annulable ? `<p class="xs muted" style="flex:1 1 100%;margin:0">${esc(t("p.cancel.tooLate.short"))}</p>` : ""}
    </div>`;
}

function rendreListe(session) {
  const tous = rdvDuPatient(session.patientId);
  const maintenant = new Date();
  const aVenir = tous.filter((r) => r.statut === "reserve" && new Date(`${r.date}T${r.heure}:00`) > maintenant);
  const autres = tous.filter((r) => !aVenir.includes(r));

  return `
    ${entete(t("p.myAppts"), t("p.subtitle"), { retour: "#/patient" })}
    ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
    ${
      tous.length === 0
        ? `<div class="empty"><p>${esc(t("p.noHistory"))}</p><a class="btn" href="#/patient/rechercher">${esc(t("p.book"))}</a></div>`
        : `
        <h2>${esc(t("p.upcoming"))}</h2>
        <div class="rdv-list" style="margin-top:8px">
          ${aVenir.length ? aVenir.map((r) => ligneRdv(r, session)).join("") : `<p class="muted small">${esc(t("p.none"))}</p>`}
        </div>
        <h2 class="section">${esc(t("p.history"))}</h2>
        <div class="rdv-list" style="margin-top:8px">
          ${autres.length ? autres.map((r) => ligneRdv(r, session)).join("") : `<p class="muted small">${esc(t("p.none"))}</p>`}
        </div>`
    }`;
}

/* ------------------------------------------------------------------ */
/* Déplacement                                                         */

function rendreDeplacement(session, rdvId) {
  const r = trouverRdv(rdvId);
  if (!r || r.patient_id !== session.patientId || r.statut !== "reserve") {
    return `${entete(t("p.move.title"))}<div class="alert alert--error">${esc(t("p.move.limit"))}</div>
      <a class="btn" href="#/patient/rdv">${esc(t("p.myAppts"))}</a>`;
  }
  if ((r.deplacements || 0) >= 2) {
    return `${entete(t("p.move.title"))}<div class="alert alert--warn">${esc(t("p.move.limit"))}</div>
      <a class="btn" href="#/patient/rdv">${esc(t("p.myAppts"))}</a>`;
  }
  etat.deplacerId = r.id;
  const m = medDe(r);
  const spec = specDe(r);

  return `
    ${entete(t("p.move.title"), null, { retour: "#/patient/rdv" })}
    ${steps(1)}
    <div class="alert alert--info">${esc(t("p.move.hint"))}</div>
    <div class="card card--flat" style="margin-bottom:12px">
      <p class="xs muted" style="margin:0">${esc(t("p.next"))}</p>
      <p class="strong" style="margin:0">${esc(fmtDateLong(r.date))} · ${esc(r.heure)} — ${esc(nomMedecin(m))} (${esc(nomSpecialite(spec))})</p>
      <p class="xs muted" style="margin:4px 0 0">${esc(t("p.move.left", { n: 2 - (r.deplacements || 0) }))}</p>
    </div>
    ${
      etat.deplacerSlot
        ? (() => {
            const slot = creneauDeId(etat.deplacerSlot);
            const nm = trouverMedecin(slot.medecinId);
            return `<div class="card card--accent" style="margin-bottom:12px">
              <p class="eyebrow">${esc(t("p.slot"))}</p>
              <h2>${esc(fmtDateLong(slot.date))} — ${esc(slot.heure)}</h2>
              <p class="small muted" style="margin:0">${esc(nomMedecin(nm))} · ${esc(etageTexte(nm.etage))}</p>
              <div class="row" style="margin-top:12px">
                <button class="btn" type="button" data-confirm-move>${esc(t("common.confirm"))}</button>
                <button class="btn btn--ghost" type="button" data-abort-move>${esc(t("common.cancel"))}</button>
              </div>
            </div>`;
          })()
        : ""
    }
    ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
    ${rendreFiltres()}
    <p class="small muted">${esc(t("p.results.hint"))}</p>
    <div id="resultats">${rendreResultats(session, { mode: "deplacement" })}</div>`;
}

/* ------------------------------------------------------------------ */
/* Compte                                                              */

function rendreCompte(session) {
  const p = trouverPatient(session.patientId);
  if (!p) return `<div class="alert alert--error">${esc(t("common.error"))}</div>`;
  const consentement = consentementPatient(p.id);

  return `
    ${entete(t("p.account.title"), t("p.account.hint"), { retour: "#/patient" })}
    ${etat.compteMessage ? `<div class="alert alert--ok" role="status">${esc(etat.compteMessage)}</div>` : ""}
    ${etat.compteErreur ? `<div class="alert alert--error" role="alert">${esc(etat.compteErreur)}</div>` : ""}
    <form data-form="compte" class="card">
      <div class="grid grid--2">
        <div class="field">
          <label for="c-prenom">${esc(t("p.firstName"))}</label>
          <input id="c-prenom" name="prenom" type="text" required value="${esc(p.prenom)}" />
        </div>
        <div class="field">
          <label for="c-nom">${esc(t("p.lastName"))}</label>
          <input id="c-nom" name="nom" type="text" required value="${esc(p.nom)}" />
        </div>
        <div class="field">
          <label for="c-mobile">${esc(t("p.mobile"))}</label>
          <input id="c-mobile" name="mobile" type="tel" dir="ltr" required value="${esc(p.mobile)}" />
        </div>
        <div class="field">
          <label for="c-naissance">${esc(t("p.birth"))}</label>
          <input id="c-naissance" name="naissance" type="date" value="${esc(p.naissance)}" max="${todayISO()}" />
        </div>
      </div>
      <div class="field">
        <label for="c-adresse">${esc(t("p.address"))}</label>
        <input id="c-adresse" name="adresse" type="text" value="${esc(p.adresse)}" />
      </div>
      <div class="grid grid--2">
        <div class="field">
          <label for="c-email">${esc(t("p.email"))} (${esc(t("common.optional"))})</label>
          <input id="c-email" name="email" type="email" value="${esc(p.email)}" />
        </div>
        <div class="field">
          <label for="c-langue">${esc(t("lang.label"))}</label>
          <select id="c-langue" name="langue">
            <option value="fr"${p.langue === "fr" ? " selected" : ""}>Français</option>
            <option value="ar"${p.langue === "ar" ? " selected" : ""}>العربية</option>
          </select>
        </div>
      </div>
      <p class="xs muted">${esc(t("p.account.traced"))}</p>
      <button class="btn" type="submit">${esc(t("common.save"))}</button>
    </form>

    <section class="card" style="margin-top:12px">
      <div class="card__head">
        <h2>${esc(t("p.consent.title"))}</h2>
        ${consentement ? badge("present") : badge("absent")}
      </div>
      ${
        consentement
          ? `<p class="small">${esc(t("p.consent.given", { date: fmtDateTime(consentement.date), version: consentement.version }))}</p>`
          : `<p class="small muted">${esc(t("p.consent.none"))}</p>`
      }
      <details>
        <summary class="small linkish" style="cursor:pointer">${esc(t("p.consent.see"))}</summary>
        <p class="xs muted" style="margin-top:8px">${esc(texteConsentement(getLang()))}</p>
      </details>
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */

export default {
  rendre({ route, session }) {
    const sous = route.segments[0] || "";
    const p = trouverPatient(session.patientId);
    if (!p) return `<div class="alert alert--error">${esc(t("common.error"))}</div>`;

    if (sous === "rechercher") return rendreRecherche(session);
    if (sous === "reserver") return rendreReservation(session, decodeURIComponent(route.segments[1] || ""));
    if (sous === "confirme") return rendreConfirmation(session, route.segments[1] || "");
    if (sous === "rdv") return rendreListe(session);
    if (sous === "deplacer") return rendreDeplacement(session, route.segments[1] || "");
    if (sous === "compte") return rendreCompte(session);
    return rendreAccueil(session);
  },

  monter({ root, route, session }) {
    const sous = route.segments[0] || "";

    // Toute consultation d'un dossier patient écrit une ligne dans le journal.
    const cleLog = `patient:${session.patientId}:${sous}:${route.segments[1] || ""}`;
    if (etat.dernierLog !== cleLog) {
      etat.dernierLog = cleLog;
      consulterPatient(session.patientId, {
        nom: `${trouverPatient(session.patientId)?.prenom || ""} ${trouverPatient(session.patientId)?.nom || ""}`.trim(),
        role: "patient",
      });
    }

    // Navigation interne.
    root.querySelectorAll("[data-annuler]").forEach((btn) => {
      btn.addEventListener("click", () => {
        etat.annulerId = btn.dataset.annuler;
        etat.erreur = "";
        rerendre();
      });
    });
    root.querySelectorAll("[data-abort-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        etat.annulerId = "";
        rerendre();
      });
    });
    root.querySelectorAll("[data-confirm-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        try {
          annulerRdv(btn.dataset.confirmCancel, {
            utilisateur: { nom: nomComplet(trouverPatient(session.patientId)), role: "patient" },
            role: "patient",
            source: "application",
          });
          etat.annulerId = "";
          etat.erreur = "";
          toast(t("p.cancelled"));
          rerendre();
        } catch (err) {
          etat.annulerId = "";
          etat.erreur = messageErreur(err);
          toast(messageErreur(err), "error");
          rerendre();
        }
      });
    });
    root.querySelectorAll("[data-deplacer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        etat.deplacerId = "";
        etat.deplacerSlot = "";
        etat.erreur = "";
        etat.motif = "";
        naviguer(`#/patient/deplacer/${btn.dataset.deplacer}`);
      });
    });

    // Filtres.
    const formFiltres = root.querySelector('form[data-form="filtres"]');
    formFiltres?.addEventListener("submit", (e) => {
      e.preventDefault();
      etat.specialite = formFiltres.querySelector("#f-specialite").value;
      etat.medecin = formFiltres.querySelector("#f-medecin").value;
      etat.date = formFiltres.querySelector("#f-date").value || todayISO();
      if (etat.medecin) {
        const m = trouverMedecin(etat.medecin);
        if (etat.specialite && m?.specialite_id !== etat.specialite) etat.medecin = "";
      }
      rerendre();
    });
    root.querySelector('form[data-form="filtres"] select[name="specialite"]')?.addEventListener("change", (e) => {
      etat.specialite = e.target.value;
      etat.medecin = "";
      rerendre();
    });
    root.querySelector('form[data-form="filtres"] select[name="medecin"]')?.addEventListener("change", (e) => {
      etat.medecin = e.target.value;
      rerendre();
    });
    root.querySelector('form[data-form="filtres"] input[name="date"]')?.addEventListener("change", (e) => {
      etat.date = e.target.value || todayISO();
      rerendre();
    });

    root.querySelectorAll("[data-expand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cle = btn.dataset.expand;
        etat.expands[cle] = !etat.expands[cle];
        rerendre();
      });
    });
    root.querySelectorAll("[data-plus-jours]").forEach((btn) => {
      btn.addEventListener("click", () => {
        etat.joursAffiches = Math.min(14, etat.joursAffiches + 7);
        rerendre();
      });
    });

    // Choix d'un créneau (réservation).
    root.querySelectorAll("[data-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        try {
          poserHold(btn.dataset.slot, session.patientId);
          etat.slotId = "";
          etat.erreur = "";
          naviguer(`#/patient/reserver/${encodeURIComponent(btn.dataset.slot)}`);
        } catch (err) {
          etat.erreur = messageErreur(err);
          toast(etat.erreur, "error");
          rerendre();
        }
      });
    });

    // Choix d'un créneau (déplacement).
    root.querySelectorAll("[data-move-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        try {
          poserHold(btn.dataset.moveSlot, session.patientId);
          etat.deplacerSlot = btn.dataset.moveSlot;
          etat.erreur = "";
          rerendre();
        } catch (err) {
          etat.erreur = messageErreur(err);
          toast(etat.erreur, "error");
          rerendre();
        }
      });
    });

    root.querySelector("[data-abort-move]")?.addEventListener("click", () => {
      if (etat.deplacerSlot) libererHold(etat.deplacerSlot, session.patientId);
      etat.deplacerSlot = "";
      rerendre();
    });

    root.querySelector("[data-confirm-move]")?.addEventListener("click", () => {
      try {
        const hold = holdDuCreneau(etat.deplacerSlot);
        if (!hold || hold.patient_id !== session.patientId) throw new ErreurMetier("hold_expire");
        deplacerRdv(etat.deplacerId, etat.deplacerSlot, {
          utilisateur: { nom: nomComplet(trouverPatient(session.patientId)), role: "patient" },
          role: "patient",
        });
        toast(t("p.moved"));
        etat.deplacerSlot = "";
        etat.deplacerId = "";
        naviguer("#/patient/rdv");
      } catch (err) {
        etat.erreur = messageErreur(err);
        toast(etat.erreur, "error");
        rerendre();
      }
    });

    // Étape motif.
    const formMotif = root.querySelector('form[data-form="motif"]');
    if (formMotif) {
      formMotif.querySelectorAll('input[name="motif"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          etat.motif = radio.value;
        });
      });
      formMotif.addEventListener("submit", (e) => {
        e.preventDefault();
        etat.motif = formMotif.querySelector('input[name="motif"]:checked')?.value || "";
        etat.motifAutre = formMotif.querySelector("#motif-texte").value.trim();
        etat.erreur = "";
        if (!etat.motif) {
          etat.erreur = t("p.motif.title") + " — " + t("common.required");
          rerendre();
          return;
        }
        if (etat.motif === MOTIF_AUTRE && !etat.motifAutre) {
          etat.erreur = t("p.motif.placeholder");
          rerendre();
          return;
        }
        etat.etape = 3;
        rerendre();
      });
    }

    root.querySelector("#consentement")?.addEventListener("change", (e) => {
      etat.consentement = e.target.checked;
    });

    root.querySelector("[data-retour-etape2]")?.addEventListener("click", () => {
      etat.etape = 2;
      etat.erreur = "";
      rerendre();
    });

    root.querySelector("[data-confirmer]")?.addEventListener("click", () => {
      const p = trouverPatient(session.patientId);
      etat.erreur = "";
      try {
        const hold = holdDuCreneau(etat.slotId);
        if (!hold || hold.patient_id !== p.id) throw new ErreurMetier("hold_expire");
        if (!aConsenti(p.id)) {
          if (!etat.consentement) {
            etat.erreur = t("p.consent.required");
            rerendre();
            return;
          }
          ajouterConsentement(p.id, getLang(), { nom: nomComplet(p), role: "patient" });
        }
        const c = consentementPatient(p.id);
        const cree = creerRdv({
          patientId: p.id,
          creneauId: etat.slotId,
          motif: etat.motif === MOTIF_AUTRE ? etat.motifAutre : etat.motif,
          canal: "web",
          consentementId: c?.id || null,
          utilisateur: { nom: nomComplet(p), role: "patient" },
          role: "patient",
        });
        etat.etape = 2;
        etat.motif = "";
        etat.motifAutre = "";
        etat.consentement = false;
        toast(t("p.booked"));
        naviguer(`#/patient/confirme/${cree.id}`);
      } catch (err) {
        etat.erreur = messageErreur(err);
        rerendre();
      }
    });

    // Compte.
    const formCompte = root.querySelector('form[data-form="compte"]');
    formCompte?.addEventListener("submit", (e) => {
      e.preventDefault();
      const p = trouverPatient(session.patientId);
      const donnees = {
        prenom: formCompte.querySelector("#c-prenom").value.trim(),
        nom: formCompte.querySelector("#c-nom").value.trim(),
        mobile: formCompte.querySelector("#c-mobile").value.replace(/[\s.-]/g, ""),
        naissance: formCompte.querySelector("#c-naissance").value,
        adresse: formCompte.querySelector("#c-adresse").value.trim(),
        email: formCompte.querySelector("#c-email").value.trim(),
        langue: formCompte.querySelector("#c-langue").value,
      };
      etat.compteErreur = "";
      etat.compteMessage = "";
      if (!donnees.prenom || !donnees.nom) {
        etat.compteErreur = t("login.err.name");
        rerendre();
        return;
      }
      if (!/^\+216\d{8}$/.test(donnees.mobile)) {
        etat.compteErreur = t("login.mobile.invalid");
        rerendre();
        return;
      }
      const autre = patientParMobile(donnees.mobile);
      if (autre && autre.id !== p.id) {
        etat.compteErreur = t("p.mobile.taken");
        rerendre();
        return;
      }
      try {
        majPatient(p.id, donnees, { nom: nomComplet(p), role: "patient" });
        majSessionPatient(trouverPatient(p.id));
        if (donnees.langue !== getLang()) {
          setLang(donnees.langue);
          try {
            localStorage.setItem("jasmins.lang", donnees.langue);
          } catch {
            /* ignore */
          }
        }
        etat.compteMessage = t("p.saved");
        toast(t("p.saved"));
        rerendre();
      } catch (err) {
        etat.compteErreur = messageErreur(err);
        rerendre();
      }
    });
  },
};
