// Données de démonstration — Polyclinique Les Jasmins, Sfax.
// 3 spécialités, 2 médecins par spécialité, 30 patients, ~20 rendez-vous.

import { addDaysISO, creneauId, estJourOuvre, todayISO, toISO, addDays, parseISODate } from "./slots.js";
import {
  calculerRappels,
  smsConfirmation,
  smsAnnulation,
  smsRappelVeille,
  smsRappel3h,
  finaliser,
  VERSION_CONSENTEMENT,
  CONSENTEMENT_FR,
  CONSENTEMENT_AR,
} from "./sms-text.js";

export const SPECIALITES = [
  {
    id: "cardio",
    nom_fr: "Cardiologie",
    nom_ar: "أمراض القلب",
    motifs_fr: ["Suivi de la tension artérielle", "Douleurs thoraciques", "Palpitations", "Contrôle après examen"],
    motifs_ar: ["متابعة ضغط الدم", "ألم في الصدر", "خفقان", "مراقبة بعد فحص"],
  },
  {
    id: "pediatrie",
    nom_fr: "Pédiatrie",
    nom_ar: "طب الأطفال",
    motifs_fr: ["Consultation de nourrisson", "Fièvre", "Vaccination", "Suivi de croissance"],
    motifs_ar: ["استشارة رضيع", "حمى", "تلقيح", "متابعة النمو"],
  },
  {
    id: "gyneco",
    nom_fr: "Gynécologie",
    nom_ar: "أمراض النساء والتوليد",
    motifs_fr: ["Suivi de grossesse", "Consultation annuelle", "Contraception", "Échographie"],
    motifs_ar: ["متابعة الحمل", "استشارة سنوية", "وسائل منع الحمل", "تصوير بالصدى"],
  },
];

export const MEDECINS = [
  { id: "dr-gharbi", nom: "Dr Ines Gharbi", nom_ar: "د. إيناس الغربي", specialite_id: "cardio", etage: "2e étage" },
  { id: "dr-bouazizi", nom: "Dr Karim Bouazizi", nom_ar: "د. كريم بوعزيزي", specialite_id: "cardio", etage: "2e étage" },
  { id: "dr-mansour", nom: "Dr Leila Mansour", nom_ar: "د. ليلى منصور", specialite_id: "pediatrie", etage: "1er étage" },
  { id: "dr-benhmida", nom: "Dr Youssef Ben Hmida", nom_ar: "د. يوسف بن حميدة", specialite_id: "pediatrie", etage: "1er étage" },
  { id: "dr-karray", nom: "Dr Sonia Karray", nom_ar: "د. سنية القراي", specialite_id: "gyneco", etage: "3e étage" },
  { id: "dr-ayadi", nom: "Dr Mehdi Ayadi", nom_ar: "د. مهدي العيادي", specialite_id: "gyneco", etage: "3e étage" },
];

const PATIENTS_BRUTS = [
  ["Amine", "Ben Salah", "20123456", "1992-03-14", ["Amine Bensalah"], "fr"],
  ["Mohamed", "Ben Amor", "98112233", "1978-07-02", ["Mohammed Ben Amor", "Med Ben Amor"], "ar"],
  ["Fatma", "Trabelsi", "22445566", "1965-01-20", ["Fathma Trabelsi"], "fr"],
  ["Ahmed", "Jlassi", "55667788", "1988-11-05", ["Ahmad Jlassi", "Ahmed Jelassi"], "ar"],
  ["Salma", "Bouaziz", "97788990", "1995-06-18", ["Selma Bouaziz"], "fr"],
  ["Youssef", "Khemiri", "23334455", "1970-09-30", [], "ar"],
  ["Mariem", "Chaabane", "99887766", "1983-12-12", ["Mariam Chaabane", "Meriem Chaabane"], "fr"],
  ["Hichem", "Dridi", "55443322", "1990-04-25", [], "fr"],
  ["Nour", "Hamdi", "29112233", "1998-08-08", ["Nourhène Hamdi"], "ar"],
  ["Sami", "Gharbi", "96223344", "1975-02-14", [], "fr"],
  ["Ines", "Louati", "25556677", "1991-10-03", ["Inès Louati"], "fr"],
  ["Walid", "Sassi", "98889900", "1986-05-22", [], "ar"],
  ["Rim", "Kallel", "22334455", "1993-01-11", ["Rym Kallel"], "fr"],
  ["Mohamed Ali", "Ayari", "97445566", "1969-07-19", ["Mohammed Ali Ayari", "Med Ali Ayari"], "ar"],
  ["Nizar", "Ferchichi", "55112233", "1984-03-08", [], "fr"],
  ["Amira", "Ben Youssef", "29445566", "1997-09-27", ["Amira BenYoussef"], "fr"],
  ["Slim", "Mejri", "96556677", "1981-06-06", [], "ar"],
  ["Hanen", "Belhaj", "22778899", "1990-12-01", ["Hanen Belhaj"], "fr"],
  ["Bilel", "Chaouachi", "99334455", "1987-08-15", [], "fr"],
  ["Sirine", "Mansouri", "27665544", "1994-04-04", ["Cyrene Mansouri"], "ar"],
  ["Tarek", "Hadded", "96887766", "1973-11-23", [], "fr"],
  ["Dorra", "Zribi", "22998877", "1996-02-09", [], "fr"],
  ["Anis", "Rekik", "55334422", "1989-05-31", [], "ar"],
  ["Soumaya", "Kacem", "99112244", "1982-10-17", ["Soumaia Kacem"], "fr"],
  ["Mehdi", "Baccouche", "23456789", "1992-07-07", [], "fr"],
  ["Leila", "Bouhlel", "98554433", "1979-03-29", ["Leïla Bouhlel"], "ar"],
  ["Karim", "Ouertani", "55221100", "1985-09-12", [], "fr"],
  ["Asma", "Tounsi", "29667788", "1999-01-05", [], "fr"],
  ["Fares", "Ben Romdhane", "96778899", "1991-06-21", ["Farès Ben Romdhane"], "ar"],
  ["Nourhène", "Abid", "22449988", "1993-12-30", ["Nourhene Abid"], "fr"],
];

const ADRESSES = [
  "12 rue Habib Maazoun, Sfax",
  "Route de Gremda km 3, Sfax",
  "Cité El Ons, Sfax",
  "Avenue Farhat Hached, Sfax",
  "Rue Mongi Slim, Sakiet Ezzit",
  "Cité Bouzayen, Sfax",
  "Route de Tunis km 5, Sfax",
];

function isoInstant(date, heure = "10:00") {
  return new Date(`${date}T${heure}:00`).toISOString();
}

function token(n) {
  return "j" + n.toString(36).padStart(5, "0");
}

export function jourDemoParDefaut() {
  let date = todayISO();
  for (let i = 0; i < 7 && !estJourOuvre(date); i += 1) date = addDaysISO(date, 1);
  return date;
}

export function creerSeed() {
  const aujourdhui = todayISO();
  const jourDemo = jourDemoParDefaut();

  const specialites = SPECIALITES.map((s) => ({ ...s }));
  const medecins = MEDECINS.map((m) => ({ ...m }));

  const patients = PATIENTS_BRUTS.map((p, index) => ({
    id: `pat-${String(index + 1).padStart(3, "0")}`,
    prenom: p[0],
    nom: p[1],
    mobile: "+216" + p[2],
    naissance: p[3],
    variantes: p[4],
    langue: p[5],
    adresse: ADRESSES[index % ADRESSES.length],
    email: "",
    source: index % 4 === 0 ? "guichet" : "web",
    cree_le: isoInstant(addDaysISO(aujourdhui, -60 + (index % 40)), "09:00"),
  }));

  const patient = (n) => patients[n - 1];

  const consentements = [];
  const sms = [];
  const journal = [];
  const rendezVous = [];

  let smsSeq = 1;
  let journalSeq = 1;
  let rdvSeq = 1;
  let consentSeq = 1;

  function ajouterConsentement(pat, date) {
    const c = {
      id: `con-${String(consentSeq++).padStart(3, "0")}`,
      patient_id: pat.id,
      version: VERSION_CONSENTEMENT,
      date: isoInstant(date, "09:30"),
      langue: pat.langue,
    };
    consentements.push(c);
    return c;
  }

  function ajouterSms({ patient_id, tel, type, langue, statut, envoi_prevu, envoye_le, contenu, rdv_id }) {
    const s = {
      id: `sms-${String(smsSeq++).padStart(3, "0")}`,
      patient_id,
      tel,
      type,
      langue,
      statut,
      envoi_prevu,
      envoye_le: envoye_le || null,
      contenu,
      rdv_id: rdv_id || null,
    };
    sms.push(s);
    return s;
  }

  function log({ utilisateur, role, action, patient_id, details, quand }) {
    journal.push({
      id: `acc-${String(journalSeq++).padStart(4, "0")}`,
      horodatage: quand || new Date().toISOString(),
      utilisateur,
      role,
      action,
      patient_id: patient_id || null,
      details: details || "",
    });
  }

  // Dates de référence : jours ouvrés passés et futurs.
  const joursPasses = [];
  const joursFuturs = [];
  for (let i = -8; i <= 14; i += 1) {
    const date = addDaysISO(aujourdhui, i);
    if (!estJourOuvre(date)) continue;
    if (i < 0) joursPasses.push(date);
    if (i > 0) joursFuturs.push(date);
  }
  const passe1 = joursPasses[joursPasses.length - 1];
  const passe2 = joursPasses[joursPasses.length - 2];
  const passe3 = joursPasses[joursPasses.length - 3];

  const specialiteDe = (medecinId) => specialites.find((s) => s.id === medecins.find((m) => m.id === medecinId).specialite_id);
  const medecinDe = (medecinId) => medecins.find((m) => m.id === medecinId);

  function ajouterRdv({ n, date, heure, medecinId, patientN, statut = "reserve", canal = "web", creeOffset = -3, motifIndex = 0, consentement }) {
    const pat = patient(patientN);
    const medecin = medecinDe(medecinId);
    const specialite = specialiteDe(medecinId);
    const cree_le = isoInstant(addDaysISO(date, creeOffset), "10:15");
    const rdv = {
      id: `rdv-${String(rdvSeq).padStart(3, "0")}`,
      groupe: `rdv-${String(rdvSeq).padStart(3, "0")}`,
      token: token(rdvSeq),
      patient_id: pat.id,
      medecin_id: medecinId,
      specialite_id: specialite.id,
      creneau_id: creneauId(medecinId, date, heure),
      date,
      heure,
      motif: specialite.motifs_fr[motifIndex % specialite.motifs_fr.length],
      statut,
      canal,
      cree_le,
      modifie_le: cree_le,
      deplacements: 0,
      consentement_id: consentement || null,
    };
    rdvSeq += 1;
    rendezVous.push(rdv);

    if (statut !== "annule") {
      const contenu = finaliser(
        smsConfirmation({
          patient: pat,
          medecin,
          specialite,
          date,
          heure,
          etage: medecin.etage,
          token: rdv.token,
          lang: pat.langue,
        }),
        pat.langue
      );
      ajouterSms({
        patient_id: pat.id,
        tel: pat.mobile,
        type: "confirmation",
        langue: pat.langue,
        statut: "envoye",
        envoi_prevu: cree_le,
        envoye_le: cree_le,
        contenu,
        rdv_id: rdv.id,
      });

      if (new Date(`${date}T${heure}:00`) > new Date()) {
        for (const r of calculerRappels({ date, heure }, new Date(cree_le))) {
          const texte =
            r.type === "rappel_veille"
              ? finaliser(
                  smsRappelVeille({
                    medecin,
                    date,
                    heure,
                    etage: medecin.etage,
                    token: rdv.token,
                    lang: pat.langue,
                  }),
                  pat.langue
                )
              : finaliser(
                  smsRappel3h({ medecin, heure, etage: medecin.etage, token: rdv.token, lang: pat.langue }),
                  pat.langue
                );
          ajouterSms({
            patient_id: pat.id,
            tel: pat.mobile,
            type: r.type,
            langue: pat.langue,
            statut: "planifie",
            envoi_prevu: r.quand.toISOString(),
            envoye_le: null,
            contenu: texte,
            rdv_id: rdv.id,
          });
        }
      }
    } else {
      ajouterSms({
        patient_id: pat.id,
        tel: pat.mobile,
        type: "annulation",
        langue: pat.langue,
        statut: "envoye",
        envoi_prevu: isoInstant(addDaysISO(date, -1), "11:00"),
        envoye_le: isoInstant(addDaysISO(date, -1), "11:00"),
        contenu: finaliser(smsAnnulation({ date, heure, medecin, lang: pat.langue }), pat.langue),
        rdv_id: rdv.id,
      });
    }

    log({
      utilisateur: canal === "web" ? pat.prenom + " " + pat.nom : "Salma Trabelsi",
      role: canal === "web" ? "patient" : "secretaire",
      action: "reservation",
      patient_id: pat.id,
      details: `${specialite.nom_fr} — ${date} ${heure}`,
      quand: cree_le,
    });

    return rdv;
  }

  // Consentements des patients qui réservent en ligne.
  const consentementsParPatient = new Map();
  const consent = (n, date) => {
    const pat = patient(n);
    if (!consentementsParPatient.has(pat.id)) {
      consentementsParPatient.set(pat.id, ajouterConsentement(pat, date));
    }
    return consentementsParPatient.get(pat.id).id;
  };

  // Historique (statuts présents, en retard, absents, annulé).
  ajouterRdv({ n: 1, date: passe1, heure: "09:10", medecinId: "dr-gharbi", patientN: 1, statut: "present", consentement: consent(1, addDaysISO(passe1, -4)) });
  ajouterRdv({ n: 2, date: passe1, heure: "09:30", medecinId: "dr-mansour", patientN: 3, statut: "present", consentement: consent(3, addDaysISO(passe1, -6)) });
  ajouterRdv({ n: 3, date: passe1, heure: "10:10", medecinId: "dr-gharbi", patientN: 2, statut: "absent", consentement: consent(2, addDaysISO(passe1, -5)) });
  ajouterRdv({ n: 4, date: passe1, heure: "15:20", medecinId: "dr-karray", patientN: 5, statut: "present", canal: "guichet", consentement: consent(5, addDaysISO(passe1, -7)) });
  ajouterRdv({ n: 5, date: passe2, heure: "08:50", medecinId: "dr-bouazizi", patientN: 4, statut: "absent", canal: "telephone", consentement: consent(4, addDaysISO(passe2, -5)) });
  ajouterRdv({ n: 6, date: passe2, heure: "11:10", medecinId: "dr-gharbi", patientN: 6, statut: "retard", consentement: consent(6, addDaysISO(passe2, -9)) });
  ajouterRdv({ n: 7, date: passe2, heure: "16:00", medecinId: "dr-ayadi", patientN: 7, statut: "present", consentement: consent(7, addDaysISO(passe2, -3)) });
  ajouterRdv({ n: 8, date: passe2, heure: "09:50", medecinId: "dr-mansour", patientN: 8, statut: "absent", consentement: consent(8, addDaysISO(passe2, -4)) });
  ajouterRdv({ n: 9, date: passe3, heure: "09:10", medecinId: "dr-karray", patientN: 9, statut: "present", consentement: consent(9, addDaysISO(passe3, -6)) });
  ajouterRdv({ n: 10, date: passe3, heure: "10:30", medecinId: "dr-gharbi", patientN: 10, statut: "present", canal: "guichet" });
  ajouterRdv({ n: 21, date: passe2, heure: "10:30", medecinId: "dr-gharbi", patientN: 21, statut: "annule", consentement: consent(21, addDaysISO(passe2, -8)) });

  // À venir.
  ajouterRdv({ n: 11, date: joursFuturs[0], heure: "09:10", medecinId: "dr-gharbi", patientN: 11, motifIndex: 1, consentement: consent(11, addDaysISO(joursFuturs[0], -2)) });
  ajouterRdv({ n: 12, date: joursFuturs[0], heure: "09:30", medecinId: "dr-mansour", patientN: 12, motifIndex: 2, consentement: consent(12, addDaysISO(joursFuturs[0], -3)) });
  ajouterRdv({ n: 13, date: joursFuturs[0], heure: "10:10", medecinId: "dr-karray", patientN: 13, canal: "telephone", consentement: consent(13, addDaysISO(joursFuturs[0], -1)) });
  ajouterRdv({ n: 14, date: joursFuturs[0], heure: "15:00", medecinId: "dr-ayadi", patientN: 14, consentement: consent(14, addDaysISO(joursFuturs[0], -3)) });
  ajouterRdv({ n: 15, date: joursFuturs[1], heure: "08:30", medecinId: "dr-bouazizi", patientN: 15, canal: "guichet" });
  ajouterRdv({ n: 16, date: joursFuturs[1], heure: "09:10", medecinId: "dr-gharbi", patientN: 16, motifIndex: 2, consentement: consent(16, addDaysISO(joursFuturs[1], -2)) });
  ajouterRdv({ n: 17, date: joursFuturs[2], heure: "11:30", medecinId: "dr-karray", patientN: 17, motifIndex: 1, consentement: consent(17, addDaysISO(joursFuturs[2], -2)) });
  ajouterRdv({ n: 18, date: joursFuturs[3], heure: "09:50", medecinId: "dr-mansour", patientN: 18, motifIndex: 3, consentement: consent(18, addDaysISO(joursFuturs[3], -2)) });
  ajouterRdv({ n: 19, date: joursFuturs[4], heure: "15:40", medecinId: "dr-gharbi", patientN: 19, consentement: consent(19, addDaysISO(joursFuturs[4], -2)) });
  ajouterRdv({ n: 20, date: joursFuturs[5], heure: "10:10", medecinId: "dr-ayadi", patientN: 20, motifIndex: 1, consentement: consent(20, addDaysISO(joursFuturs[5], -2)) });

  // Journée de démonstration : rendez-vous du jour, statuts cohérents avec l'heure.
  const maintenant = new Date();
  const heureActuelle = maintenant.toTimeString().slice(0, 5);
  const statutDuJour = (heure, siPasse) => (heure < heureActuelle ? siPasse : "reserve");
  ajouterRdv({ n: 22, date: jourDemo, heure: "08:30", medecinId: "dr-gharbi", patientN: 22, statut: statutDuJour("08:30", "present"), motifIndex: 1, consentement: consent(22, addDaysISO(jourDemo, -2)) });
  ajouterRdv({ n: 23, date: jourDemo, heure: "09:30", medecinId: "dr-bouazizi", patientN: 23, statut: statutDuJour("09:30", "absent"), motifIndex: 2, consentement: consent(23, addDaysISO(jourDemo, -2)) });
  ajouterRdv({ n: 24, date: jourDemo, heure: "15:00", medecinId: "dr-karray", patientN: 24, statut: statutDuJour("15:00", "retard"), motifIndex: 2, consentement: consent(24, addDaysISO(jourDemo, -2)) });
  ajouterRdv({ n: 25, date: jourDemo, heure: "16:20", medecinId: "dr-ayadi", patientN: 25, statut: statutDuJour("16:20", "present"), consentement: consent(25, addDaysISO(jourDemo, -2)) });
  ajouterRdv({ n: 26, date: joursFuturs[3], heure: "15:20", medecinId: "dr-bouazizi", patientN: 1, motifIndex: 2, consentement: consent(1, addDaysISO(passe1, -4)) });

  // Absence à venir, sans rendez-vous impacté.
  const indisponibilites = [
    {
      id: "ind-001",
      medecin_id: "dr-ayadi",
      date: addDaysISO(jourDemo, 4),
      date_fin: addDaysISO(jourDemo, 4),
      recurrence: "aucune",
      journee: false,
      heure_debut: "15:00",
      heure_fin: "18:00",
      motif: "Bloc opératoire",
      cree_le: new Date().toISOString(),
    },
  ];

  // Journal des accès initial.
  log({ utilisateur: "Salma Trabelsi", role: "secretaire", action: "consultation", patient_id: patient(2).id, details: "Recherche au guichet — confirmation du numéro", quand: isoInstant(addDaysISO(aujourdhui, -2), "11:42") });
  log({ utilisateur: "Dr Ines Gharbi", role: "medecin", action: "consultation", patient_id: patient(1).id, details: "Préparation de la consultation", quand: isoInstant(addDaysISO(aujourdhui, -1), "08:55") });
  log({ utilisateur: "Salma Trabelsi", role: "secretaire", action: "pointage", patient_id: patient(6).id, details: "Passage de réservé à en retard", quand: isoInstant(addDaysISO(aujourdhui, -2), "11:05") });
  log({ utilisateur: "Salma Trabelsi", role: "secretaire", action: "modification", patient_id: patient(4).id, details: "Adresse corrigée", quand: isoInstant(addDaysISO(aujourdhui, -4), "16:20") });

  // Le consentement est aussi tracé dans le journal.
  for (const c of consentements) {
    const pat = patients.find((p) => p.id === c.patient_id);
    log({
      utilisateur: `${pat.prenom} ${pat.nom}`,
      role: "patient",
      action: "consentement",
      patient_id: pat.id,
      details: `Consentement ${c.version}`,
      quand: c.date,
    });
  }

  journal.sort((a, b) => new Date(b.horodatage) - new Date(a.horodatage));

  return {
    version: 5,
    seedDate: aujourdhui,
    specialites,
    medecins,
    patients,
    rendezVous,
    indisponibilites,
    consentements,
    sms,
    journal,
    users: [
      { id: "usr-secretaire", nom: "Salma Trabelsi", role: "secretaire" },
      { id: "usr-dpo", nom: "Nizar Kallel", role: "dpo" },
    ],
    holds: [],
    seq: { patient: 30, rdv: rdvSeq - 1, sms: smsSeq - 1, journal: journalSeq - 1, consent: consentSeq - 1, indispo: 1 },
    consentementsTextes: { version: VERSION_CONSENTEMENT, fr: CONSENTEMENT_FR, ar: CONSENTEMENT_AR },
  };
}


