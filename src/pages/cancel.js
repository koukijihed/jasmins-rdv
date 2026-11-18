// Annulation depuis le lien reçu par SMS (sans connexion).

import { t, getLang, fmtDateLong } from "../i18n.js";
import { esc, badge, toast, nomMedecin, nomSpecialite, etageTexte } from "../ui.js";
import { rerendre } from "../router.js";
import {
  rdvParToken,
  medecin as trouverMedecin,
  specialite as trouverSpecialite,
  patient as trouverPatient,
  annulerRdv,
  smsDuRdv,
  ErreurMetier,
} from "../db.js";

const etat = { fait: false, erreur: "" };

export default {
  rendre({ route }) {
    const token = route.segments[0] || "";
    const r = rdvParToken(token);

    if (!r) {
      return `
        <div class="card" style="max-width:560px;margin:0 auto">
          <h1>${esc(t("cl.title"))}</h1>
          <div class="alert alert--error">${esc(t("cl.invalid"))}</div>
          <a class="btn" href="#/connexion">${esc(t("cl.login"))}</a>
        </div>`;
    }

    const med = trouverMedecin(r.medecin_id);
    const spec = trouverSpecialite(r.specialite_id);
    const p = trouverPatient(r.patient_id);
    const debut = new Date(`${r.date}T${r.heure}:00`);
    const tropTard = debut.getTime() - Date.now() < 4 * 3600 * 1000;

    if (etat.fait) {
      return `
        <div class="card" style="max-width:560px;margin:0 auto">
          <h1>${esc(t("cl.title"))}</h1>
          <div class="alert alert--ok" role="status">${esc(t("cl.done"))}</div>
          <p class="small muted">${esc(t("sms.type.annulation"))}</p>
          <a class="btn" href="#/connexion">${esc(t("cl.login"))}</a>
        </div>`;
    }

    const etatRdv =
      r.statut === "annule"
        ? `<div class="alert alert--warn">${esc(t("cl.already"))}</div>`
        : r.statut === "deplace"
        ? `<div class="alert alert--warn">${esc(t("cl.moved"))}</div>`
        : tropTard
        ? `<div class="alert alert--warn">${esc(t("cl.tooLate"))}</div>`
        : `<button class="btn btn--danger" type="button" data-confirmer-annulation>${esc(t("cl.confirm"))}</button>`;

    return `
      <div class="card" style="max-width:560px;margin:0 auto">
        <h1>${esc(t("cl.title"))}</h1>
        <p class="muted">${esc(t("brand.name"))} · ${esc(t("brand.city"))}</p>
        <div class="card card--accent" style="margin:12px 0">
          <p class="small" style="margin:0 0 4px">${esc(t("s.patient"))} : <strong>${esc(`${p?.prenom || ""} ${p?.nom || ""}`)}</strong></p>
          <p class="strong" style="margin:0">${esc(fmtDateLong(r.date))} — ${esc(r.heure)}</p>
          <p class="small muted" style="margin:4px 0 0">${esc(nomMedecin(med))} · ${esc(nomSpecialite(spec))} · ${esc(etageTexte(med?.etage))}</p>
          <div style="margin-top:8px">${badge(r.statut)}</div>
        </div>
        ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
        ${etatRdv}
        <p class="xs muted" style="margin-top:16px">${esc(t("demo.note"))}</p>
      </div>`;
  },

  monter({ root, route }) {
    const token = route.segments[0] || "";
    root.querySelector("[data-confirmer-annulation]")?.addEventListener("click", () => {
      const r = rdvParToken(token);
      if (!r) return;
      try {
        annulerRdv(r.id, {
          utilisateur: { nom: "Patient (lien SMS)", role: "patient" },
          role: "patient",
          source: "lien SMS",
        });
        etat.fait = true;
        etat.erreur = "";
        const sms = smsDuRdv(r.id).find((s) => s.type === "annulation");
        if (sms) toast(t("cl.done"));
        rerendre();
      } catch (err) {
        etat.erreur = err instanceof ErreurMetier && err.code === "trop_tard" ? t("cl.tooLate") : t("common.error");
        rerendre();
      }
    });
  },
};
