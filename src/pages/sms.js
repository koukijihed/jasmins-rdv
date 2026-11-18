// Journal SMS (mode démo) : tous les messages simulés, avec langue, destinataire et heure prévue.

import { t, fmtDateTime, smsTypeLabel, smsStatusLabel, getLang } from "../i18n.js";
import { esc, badge, nomComplet } from "../ui.js";
import { rerendre } from "../router.js";
import { journalSms, patient as trouverPatient, rdv as trouverRdv, getState } from "../db.js";

const etat = { type: "", statut: "" };

const TYPES = ["confirmation", "rappel_veille", "rappel_3h", "annulation", "absence", "code"];
const STATUTS = ["planifie", "envoye", "annule"];

function rendreMessage(s) {
  const p = s.patient_id ? trouverPatient(s.patient_id) : null;
  const r = s.rdv_id ? trouverRdv(s.rdv_id) : null;
  return `
    <article class="log-item">
      <div class="log-item__top">
        <div class="row" style="gap:6px">
          <span class="badge badge--reserve">${esc(smsTypeLabel(s.type))}</span>
          <span class="badge">${s.langue === "ar" ? "عربية" : "FR"}</span>
          <span class="badge badge--${s.statut === "planifie" ? "planifie" : s.statut}">${esc(smsStatusLabel(s.statut))}</span>
        </div>
        <span class="small muted">${esc(t("sms.planned"))} : ${esc(fmtDateTime(s.envoi_prevu))}</span>
      </div>
      <div class="log-grid">
        <p class="kv"><span class="kv__k">${esc(t("sms.to"))}</span><span class="kv__v">${esc(p ? nomComplet(p) : "—")} <span dir="ltr">${esc(s.tel)}</span></span></p>
        <p class="kv"><span class="kv__k">${esc(t("sms.sent"))}</span><span class="kv__v">${s.envoye_le ? esc(fmtDateTime(s.envoye_le)) : "—"}</span></p>
      </div>
      <div class="sms-body" dir="${s.langue === "ar" ? "rtl" : "ltr"}">${esc(s.contenu)}</div>
      ${
        r
          ? `<p class="xs" style="margin:8px 0 0"><a href="#/annuler/${esc(r.token)}">${esc(t("cl.title"))} — ${esc(r.date)} ${esc(r.heure)}</a></p>`
          : ""
      }
      <p class="xs muted" style="margin:4px 0 0">${esc(String([...s.contenu].length))} / ${s.langue === "ar" ? 134 : 306}</p>
    </article>`;
}

export default {
  rendre() {
    const messages = journalSms({ type: etat.type, statut: etat.statut });

    return `
      <div class="page-head">
        <div class="page-head__text">
          <p class="eyebrow">${esc(t("demo.badge"))}</p>
          <h1>${esc(t("sms.title"))}</h1>
          <p class="muted" style="margin:4px 0 0">${esc(t("sms.subtitle"))}</p>
        </div>
        <div class="page-head__actions">
          <span class="badge">${esc(t("sms.count", { n: messages.length }))}</span>
        </div>
      </div>
      <div class="alert alert--info">${esc(t("sms.note"))}</div>
      <div class="card card--flat">
        <div class="filters">
          <div class="field">
            <label for="sms-type">${esc(t("sms.type"))}</label>
            <select id="sms-type">
              <option value="">${esc(t("common.all"))}</option>
              ${TYPES.map(
                (type) => `<option value="${type}"${type === etat.type ? " selected" : ""}>${esc(smsTypeLabel(type))}</option>`
              ).join("")}
            </select>
          </div>
          <div class="field">
            <label for="sms-statut">${esc(t("sms.status"))}</label>
            <select id="sms-statut">
              <option value="">${esc(t("common.all"))}</option>
              ${STATUTS.map(
                (st) => `<option value="${st}"${st === etat.statut ? " selected" : ""}>${esc(smsStatusLabel(st))}</option>`
              ).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="section">
        ${messages.length === 0 ? `<div class="empty">${esc(t("sms.empty"))}</div>` : messages.map(rendreMessage).join("")}
      </div>`;
  },

  monter({ root }) {
    root.querySelector("#sms-type")?.addEventListener("change", (e) => {
      etat.type = e.target.value;
      rerendre();
    });
    root.querySelector("#sms-statut")?.addEventListener("change", (e) => {
      etat.statut = e.target.value;
      rerendre();
    });
    void getState();
    void badge;
    void getLang;
  },
};
