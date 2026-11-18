// Recherche tolérante aux fautes et aux translittérations (Mohamed / Mohammed / Med).

import { getState } from "./db.js";

export function normaliser(texte) {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`\-_.,]/g, " ")
    .replace(/ph/g, "f")
    .replace(/ou/g, "u")
    .replace(/ck|q/g, "k")
    .replace(/c(?=[aou])/g, "k")
    .replace(/th/g, "t")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let precedente = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const courante = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courante[j] = Math.min(courante[j - 1] + 1, precedente[j] + 1, precedente[j - 1] + cout);
    }
    precedente = courante;
  }
  return precedente[b.length];
}

function tolerance(longueur) {
  if (longueur <= 3) return 0;
  if (longueur <= 5) return 1;
  if (longueur <= 8) return 2;
  return 3;
}

function motCorrespond(mot, cible) {
  if (cible.startsWith(mot) || mot.startsWith(cible)) return true;
  if (mot.length >= 4 && cible.length >= 4 && cible.includes(mot)) return true;
  return levenshtein(mot, cible) <= tolerance(Math.max(mot.length, cible.length));
}

/**
 * Score 0..100. 100 = correspondance exacte du nom, prénom ou mobile.
 */
export function scorePatient(patient, requete) {
  const q = normaliser(requete);
  // La normalisation peut réduire une saisie aberrante (« zzzz » → « z ») : on l'ignore.
  if (!q || q.length < 2) return 0;
  const chiffres = String(requete).replace(/\D/g, "");
  if (chiffres.length >= 4) {
    const tel = String(patient.mobile).replace(/\D/g, "");
    if (tel.endsWith(chiffres)) return 100;
    if (tel.includes(chiffres)) return 85;
  }

  const noms = [patient.prenom, patient.nom, `${patient.prenom} ${patient.nom}`, ...(patient.variantes || [])];
  let meilleur = 0;
  for (const brut of noms) {
    const cible = normaliser(brut);
    if (!cible) continue;
    if (cible === q) return 100;
    if (cible.startsWith(q)) meilleur = Math.max(meilleur, 90);
    if (q.length >= 4 && cible.includes(q)) meilleur = Math.max(meilleur, 75);

    const motsRequete = q.split(" ").filter(Boolean);
    const motsCible = cible.split(" ").filter(Boolean);
    if (motsRequete.length && motsRequete.every((m) => motsCible.some((c) => motCorrespond(m, c)))) {
      meilleur = Math.max(meilleur, 80);
    } else {
      const tous = [...motsCible, ...q.split(" ")].filter(Boolean);
      let score = 0;
      for (const m of motsRequete) {
        if (motsCible.some((c) => motCorrespond(m, c))) score += 1;
      }
      meilleur = Math.max(meilleur, (score / Math.max(1, motsRequete.length)) * 70);
      void tous;
    }
  }
  return Math.round(meilleur);
}

export function rechercherPatients(requete, limite = 8) {
  const q = String(requete || "").trim();
  if (q.length < 2) return [];
  return getState()
    .patients.map((p) => ({ patient: p, score: scorePatient(p, q) }))
    .filter((x) => x.score >= 55)
    .sort((a, b) => b.score - a.score || a.patient.nom.localeCompare(b.patient.nom))
    .slice(0, limite);
}
