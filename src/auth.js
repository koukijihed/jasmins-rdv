// Authentification de démonstration : OTP SMS simulé + sessions par rôle.

import { getLang } from "./i18n.js";
import {
  patientParMobile,
  creerPatient,
  ajouterSmsCode,
  logAcces,
  getState,
  initDb,
  majPatient,
} from "./db.js";

const SESSION_KEY = "jasmins.session";
const OTP_KEY = "jasmins.otp";
const PENDING_KEY = "jasmins.pending";

export class ErreurAuth extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

function lire(cle, stockage = sessionStorage) {
  try {
    return JSON.parse(stockage.getItem(cle) || "null");
  } catch {
    return null;
  }
}

function ecrire(cle, valeur, stockage = sessionStorage) {
  try {
    if (valeur === null) stockage.removeItem(cle);
    else stockage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* stockage indisponible */
  }
}

export function session() {
  return lire(SESSION_KEY);
}

export function estConnecte() {
  return Boolean(session());
}

export function connecterSession(utilisateur) {
  ecrire(SESSION_KEY, utilisateur);
  logAcces({
    utilisateur: utilisateur.nom,
    role: utilisateur.role,
    action: "connexion",
    patientId: utilisateur.patientId || null,
    details: "",
  });
  return utilisateur;
}

export function deconnecter() {
  ecrire(SESSION_KEY, null);
  ecrire(PENDING_KEY, null);
}

export function seConnecterSecretaire(lang) {
  initDb();
  return connecterSession({
    role: "secretaire",
    userId: "usr-secretaire",
    nom: "Salma Trabelsi",
  });
}

export function seConnecterMedecin(medecinId) {
  initDb();
  const med = getState().medecins.find((m) => m.id === medecinId);
  if (!med) throw new ErreurAuth("medecin_inconnu");
  return connecterSession({
    role: "medecin",
    userId: `usr-${med.id}`,
    nom: med.nom,
    medecinId: med.id,
  });
}

export function seConnecterDpo() {
  initDb();
  return connecterSession({
    role: "dpo",
    userId: "usr-dpo",
    nom: "Nizar Kallel",
  });
}

export function seConnecterPatient(p) {
  initDb();
  // La langue de l'interface devient la langue de référence du patient (SMS compris).
  if (p.langue !== getLang()) {
    majPatient(p.id, { langue: getLang() }, { nom: `${p.prenom} ${p.nom}`, role: "patient" });
  }
  return connecterSession({
    role: "patient",
    userId: p.id,
    nom: `${p.prenom} ${p.nom}`,
    patientId: p.id,
  });
}

/** Met à jour le nom affiché dans la session après correction du compte. */
export function majSessionPatient(p) {
  const s = session();
  if (!s || s.role !== "patient" || s.patientId !== p.id) return s;
  const maj = { ...s, nom: `${p.prenom} ${p.nom}` };
  ecrire(SESSION_KEY, maj);
  return maj;
}

export function normaliserMobile(valeur) {
  return String(valeur || "").replace(/[\s.\-()]/g, "");
}

export function mobileValide(valeur) {
  return /^\+216\d{8}$/.test(normaliserMobile(valeur));
}

export function formaterMobile(valeur) {
  const v = normaliserMobile(valeur);
  if (!/^\+216\d{8}$/.test(v)) return valeur;
  return `+216 ${v.slice(4, 6)} ${v.slice(6, 9)} ${v.slice(9, 12)}`;
}

function otpActuel() {
  return lire(OTP_KEY, localStorage);
}

function sauverOtp(valeur) {
  ecrire(OTP_KEY, valeur, localStorage);
}

export function demanderCode(mobile, langue = getLang()) {
  initDb();
  const tel = normaliserMobile(mobile);
  if (!mobileValide(tel)) throw new ErreurAuth("mobile_invalide");

  const existant = otpActuel();
  const maintenant = Date.now();
  if (existant && existant.mobile === tel && existant.bloque_jusqua > maintenant) {
    throw new ErreurAuth("bloque", { minutes: Math.ceil((existant.bloque_jusqua - maintenant) / 60000) });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  sauverOtp({
    mobile: tel,
    code,
    expire_le: maintenant + 5 * 60 * 1000,
    essais: 0,
    bloque_jusqua: 0,
  });
  ajouterSmsCode({ tel, code, langue });
  return code;
}

export function codeDemo() {
  return otpActuel()?.code || null;
}

export function verifierCode(mobile, code) {
  initDb();
  const tel = normaliserMobile(mobile);
  const courant = otpActuel();
  const maintenant = Date.now();

  if (!courant || courant.mobile !== tel) throw new ErreurAuth("code_expire");
  if (courant.bloque_jusqua > maintenant) {
    throw new ErreurAuth("bloque", { minutes: Math.ceil((courant.bloque_jusqua - maintenant) / 60000) });
  }
  if (maintenant > courant.expire_le) throw new ErreurAuth("code_expire");
  if (String(code).trim() !== courant.code) {
    const essais = courant.essais + 1;
    if (essais >= 3) {
      sauverOtp({ ...courant, essais: 0, bloque_jusqua: maintenant + 15 * 60 * 1000 });
      throw new ErreurAuth("bloque", { minutes: 15 });
    }
    sauverOtp({ ...courant, essais });
    throw new ErreurAuth("code_incorrect", { essai: essais });
  }

  sauverOtp(null);
  const p = patientParMobile(tel);
  if (p) return { patient: p, nouveau: false };

  ecrire(PENDING_KEY, { mobile: tel }, sessionStorage);
  return { patient: null, nouveau: true, mobile: tel };
}

export function mobileEnAttente() {
  return lire(PENDING_KEY, sessionStorage)?.mobile || null;
}

export function creerComptePatient({ prenom, nom, langue = getLang() }) {
  initDb();
  const mobile = mobileEnAttente();
  if (!mobile) throw new ErreurAuth("session_incomplete");
  const existant = patientParMobile(mobile);
  if (existant) {
    ecrire(PENDING_KEY, null);
    return seConnecterPatient(existant);
  }
  const p = creerPatient({ prenom, nom, mobile, langue, source: "web" });
  logAcces({
    utilisateur: `${p.prenom} ${p.nom}`,
    role: "patient",
    action: "creation_compte",
    patientId: p.id,
    details: `Compte créé avec le mobile ${formaterMobile(p.mobile)}`,
  });
  ecrire(PENDING_KEY, null);
  return seConnecterPatient(p);
}

export const CHEMIN_PAR_ROLE = {
  patient: "#/patient",
  secretaire: "#/secretaire",
  medecin: "#/medecin",
  dpo: "#/donnees",
};
