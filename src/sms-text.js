// Modèles de messages SMS (aucun envoi réel) + calcul des rappels.
// Limites imposées : 306 caractères en alphabet latin, 134 en arabe.

export const LIMITE_LATIN = 306;
export const LIMITE_ARABE = 134;

export const VERSION_CONSENTEMENT = "v1.0";

export const CONSENTEMENT_FR =
  "J'accepte que mes données personnelles et de santé soient traitées par la Polyclinique Les Jasmins " +
  "(Sfax) pour la gestion de mes rendez-vous et ma prise en charge, conformément à la loi organique " +
  "tunisienne n° 2004-63 du 27 juillet 2004 relative à la protection des données à caractère personnel. " +
  "Je peux exercer mes droits d'accès et de rectification auprès de l'accueil de la polyclinique.";

export const CONSENTEMENT_AR =
  "أوافق على معالجة معطياتي الشخصية والصحية من قبل مصحة الياسمين بصفاقس لأجل تسيير مواعيدي وتعهّدي، " +
  "وفقًا للقانون الأساسي التونسي عدد 2004-63 المؤرخ في 27 جويلية 2004 المتعلق بحماية المعطيات ذات الطابع الشخصي. " +
  "يمكنني ممارسة حقوقي في الولوج والتصحيح لدى استقبال المصحة.";

const MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function jourSemaineFr(date) {
  return ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."][date.getDay()];
}

export function dateSms(iso, lang) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (lang === "ar") return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  return `${jourSemaineFr(date)} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function etageSms(etage, lang) {
  if (lang === "ar") {
    const n = String(etage).replace(/[^\d]/g, "");
    return n === "1" ? "الطابق 1" : "الطابق " + n;
  }
  return String(etage);
}

function nomCourt(medecin, lang) {
  return lang === "ar" ? medecin.nom_ar : medecin.nom;
}

function lien(token) {
  return `jasmins.tn/a/${token}`;
}

export function smsConfirmation({ patient, medecin, specialite, date, heure, etage, token, lang }) {
  if (lang === "ar") {
    return (
      `تأكيد الموعد: ${dateSms(date, "ar")} ${heure}، ${nomCourt(medecin, "ar")}، ` +
      `${etageSms(etage, "ar")}. أحضر بطاقة لابس (CNAM) والهوية. إلغاء: ${lien(token)}`
    );
  }
  return (
    `RDV confirme le ${dateSms(date, "fr")} a ${heure} avec ${medecin.nom} (${specialite.nom_fr}), ` +
    `${etage}. Apportez votre carte Labes (CNAM) et votre piece d'identite. Annulation: ${lien(token)}`
  );
}

export function smsRappelVeille({ medecin, date, heure, etage, token, lang }) {
  if (lang === "ar") {
    return (
      `تذكير: موعدك غدًا ${dateSms(date, "ar")} على الساعة ${heure} مع ${nomCourt(medecin, "ar")}، ` +
      `${etageSms(etage, "ar")}. أحضر بطاقة لابس والهوية. إلغاء: ${lien(token)}`
    );
  }
  return (
    `Rappel: votre RDV demain ${dateSms(date, "fr")} a ${heure} avec ${medecin.nom}, ${etage}. ` +
    `Apportez votre carte Labes (CNAM) et votre piece d'identite. Annulation: ${lien(token)}`
  );
}

export function smsRappel3h({ medecin, heure, etage, token, lang }) {
  if (lang === "ar") {
    return `تذكير: موعدك اليوم على الساعة ${heure} مع ${nomCourt(medecin, "ar")}، ${etageSms(etage, "ar")}. إلغاء: ${lien(token)}`;
  }
  return `Rappel: votre RDV aujourd'hui a ${heure} avec ${medecin.nom}, ${etage}. Annulation: ${lien(token)}`;
}

export function smsAnnulation({ date, heure, medecin, lang }) {
  if (lang === "ar") {
    return `تم إلغاء موعدك يوم ${dateSms(date, "ar")} على الساعة ${heure} مع ${nomCourt(medecin, "ar")}. لحجز موعد جديد: jasmins.tn`;
  }
  return `Votre rendez-vous du ${dateSms(date, "fr")} a ${heure} avec ${medecin.nom} est annule. Pour reprendre un RDV: jasmins.tn`;
}

export function smsAbsence({ medecin, date, heure, token, lang }) {
  if (lang === "ar") {
    return `${nomCourt(medecin, "ar")} غائب يوم ${dateSms(date, "ar")}. أُلغي موعدك على الساعة ${heure}. اختر موعدًا آخر: ${lien(token)}`;
  }
  return `Le ${medecin.nom} est absent le ${dateSms(date, "fr")}. Votre RDV de ${heure} est annule. Choisissez un autre creneau: ${lien(token)}`;
}

export function smsCode({ code, lang }) {
  if (lang === "ar") return `رمز الدخول إلى الياسمين: ${code}. صالح 5 دقائق. لا تشاركه مع أي شخص.`;
  return `Votre code de connexion Jasmins: ${code}. Valable 5 minutes. Ne le partagez avec personne.`;
}

export function limitePour(lang) {
  return lang === "ar" ? LIMITE_ARABE : LIMITE_LATIN;
}

export function longueur(msg) {
  return [...msg].length;
}

export function estDansLaLimite(msg, lang) {
  return longueur(msg) <= limitePour(lang);
}

/** Insère un espace insécable manquant, contrôle la limite, et tronque proprement en dernier recours. */
export function finaliser(msg, lang) {
  const max = limitePour(lang);
  if (longueur(msg) <= max) return msg;
  const coupe = [...msg].slice(0, max - 1).join("");
  return coupe.replace(/\s+\S*$/, " ") + "…";
}

/**
 * Heures d'envoi des rappels : veille à 18 h, 3 h avant, uniquement entre 9 h et 20 h.
 * Retourne des instants Date, sans ceux déjà passés si `apres` est fourni.
 */
export function calculerRappels({ date, heure }, apres = new Date()) {
  const debut = new Date(`${date}T${heure}:00`);
  const rappels = [];

  const veille = new Date(debut);
  veille.setDate(veille.getDate() - 1);
  veille.setHours(18, 0, 0, 0);
  if (veille > apres) rappels.push({ type: "rappel_veille", quand: veille });

  const troisHeures = new Date(debut.getTime() - 3 * 60 * 60 * 1000);
  let quand3h = troisHeures;
  if (quand3h.getHours() < 9) {
    quand3h = new Date(debut);
    quand3h.setHours(9, 0, 0, 0);
  }
  const utile = quand3h.getTime() <= debut.getTime() - 20 * 60 * 1000;
  const dansPlage = quand3h.getHours() >= 9 && quand3h.getHours() < 20;
  if (utile && dansPlage && quand3h > apres) rappels.push({ type: "rappel_3h", quand: quand3h });

  return rappels.sort((a, b) => a.quand - b.quand);
}
