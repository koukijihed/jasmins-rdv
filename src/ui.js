// Petits utilitaires d'interface partagés.

import { t, getLang } from "./i18n.js";

export function esc(valeur) {
  return String(valeur ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function badge(statut, { libre = false } = {}) {
  const connus = ["reserve", "present", "retard", "absent", "annule", "deplace", "planifie", "envoye"];
  const classe = connus.includes(statut) ? `badge--${statut}` : "";
  return `<span class="badge ${classe}">${esc(t(`st.${statut}`))}</span>`;
}

export function badgeCanal(canal) {
  return `<span class="badge">${esc(t(`canal.${canal}`))}</span>`;
}

export function toast(message, type = "ok") {
  document.querySelectorAll(".toast").forEach((el) => el.remove());
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

export function nomComplet(p) {
  return p ? `${p.prenom} ${p.nom}` : "";
}

export function nomMedecin(m) {
  if (!m) return "";
  return getLang() === "ar" && m.nom_ar ? m.nom_ar : m.nom;
}

export function nomSpecialite(s) {
  if (!s) return "";
  return getLang() === "ar" && s.nom_ar ? s.nom_ar : s.nom_fr;
}

const ETAGES_AR = { "1": "الطابق الأول", "2": "الطابق الثاني", "3": "الطابق الثالث", "4": "الطابق الرابع" };

export function etageTexte(etage) {
  if (!etage) return "";
  if (getLang() !== "ar") return etage;
  const n = String(etage).replace(/[^\d]/g, "");
  return ETAGES_AR[n] || `الطابق ${n}`;
}

/** Affiche le motif dans la langue de l'interface (les motifs du catalogue sont bilingues). */
export function motifTexte(motif, specialite) {
  if (!motif || !specialite) return motif || "";
  const indexFr = (specialite.motifs_fr || []).indexOf(motif);
  if (indexFr >= 0) return getLang() === "ar" ? specialite.motifs_ar[indexFr] : motif;
  const indexAr = (specialite.motifs_ar || []).indexOf(motif);
  if (indexAr >= 0) return getLang() === "ar" ? motif : specialite.motifs_fr[indexAr];
  return motif;
}

export function age(p) {
  if (!p?.naissance) return "";
  const d = new Date(p.naissance);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export function csvTelecharger(nomFichier, lignes) {
  const contenu = lignes
    .map((ligne) => ligne.map((cellule) => `"${String(cellule ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob(["\uFEFF" + contenu], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function minutesRestantes(hold) {
  if (!hold) return 0;
  return Math.max(0, Math.ceil((new Date(hold.expire_le).getTime() - Date.now()) / 60000));
}

export function pluriel(n, singulier, plurielMot = null) {
  return n > 1 ? plurielMot || `${singulier}s` : singulier;
}

export function optionsDepuis(liste, valeur, { vide = null, label = (x) => x } = {}) {
  const opts = [];
  if (vide !== null) opts.push(`<option value="">${esc(vide)}</option>`);
  for (const item of liste) {
    const v = typeof item === "string" ? item : item.valeur;
    const l = typeof item === "string" ? label(item) : label(item);
    opts.push(`<option value="${esc(v)}"${String(v) === String(valeur) ? " selected" : ""}>${esc(l)}</option>`);
  }
  return opts.join("");
}
