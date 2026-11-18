// Espace responsable des données personnelles : journal des accès, lecture seule, export CSV.

import { t, fmtDate, fmtDateTime, actionLabel, roleLabel } from "../i18n.js";
import { esc, toast, csvTelecharger } from "../ui.js";
import { rerendre } from "../router.js";
import { journalFiltre, journalUtilisateurs, patient as trouverPatient, getState } from "../db.js";

const etat = {
  utilisateur: "",
  action: "",
  du: "",
  au: "",
};

const ACTIONS = [
  "consultation",
  "connexion",
  "creation_compte",
  "consentement",
  "reservation",
  "annulation",
  "deplacement",
  "pointage",
  "blocage",
  "modification",
];

function filtrer() {
  return journalFiltre({
    utilisateurId: etat.utilisateur || undefined,
    action: etat.action || undefined,
    du: etat.du || undefined,
    au: etat.au || undefined,
  });
}

function rendreLigne(e) {
  const p = e.patient_id ? trouverPatient(e.patient_id) : null;
  return `
    <article class="log-item">
      <div class="log-item__top">
        <strong>${esc(actionLabel(e.action))}</strong>
        <span class="small muted">${esc(fmtDateTime(e.horodatage))}</span>
      </div>
      <div class="log-grid">
        <p class="kv"><span class="kv__k">${esc(t("g.who"))}</span><span class="kv__v">${esc(e.utilisateur)} · ${esc(roleLabel(e.role))}</span></p>
        <p class="kv"><span class="kv__k">${esc(t("g.patient"))}</span><span class="kv__v">${p ? esc(`${p.prenom} ${p.nom} (${p.mobile})`) : "—"}</span></p>
      </div>
      ${e.details ? `<p class="xs muted" style="margin:8px 0 0"><span class="kv__k">${esc(t("g.details"))} :</span> ${esc(e.details)}</p>` : ""}
    </article>`;
}

function exporter() {
  const lignes = filtrer();
  const entetes = [
    "ID",
    t("g.when"),
    t("g.user"),
    t("g.role"),
    t("g.action"),
    t("g.patient"),
    t("g.details"),
  ];
  const donnees = lignes.map((e) => {
    const p = e.patient_id ? trouverPatient(e.patient_id) : null;
    return [
      e.id,
      e.horodatage,
      e.utilisateur,
      roleLabel(e.role),
      actionLabel(e.action),
      p ? `${p.prenom} ${p.nom} (${p.mobile})` : "",
      e.details,
    ];
  });
  csvTelecharger(`journal-acces-${new Date().toISOString().slice(0, 10)}.csv`, [entetes, ...donnees]);
  toast(t("g.exported"));
}

export default {
  rendre() {
    const lignes = filtrer();
    const utilisateurs = journalUtilisateurs();

    return `
      <div class="page-head">
        <div class="page-head__text">
          <h1>${esc(t("g.title"))}</h1>
          <p class="muted" style="margin:4px 0 0">${esc(t("g.subtitle"))}</p>
        </div>
        <div class="page-head__actions">
          <span class="badge">${esc(t("g.readonly"))}</span>
          <button class="btn btn--secondary" type="button" data-export>${esc(t("common.export"))}</button>
        </div>
      </div>
      <div class="card card--flat">
        <div class="filters filters--4">
          <div class="field">
            <label for="g-utilisateur">${esc(t("g.user"))}</label>
            <select id="g-utilisateur">
              <option value="">${esc(t("g.allUsers"))}</option>
              ${utilisateurs
                .map((u) => `<option value="${esc(u)}"${u === etat.utilisateur ? " selected" : ""}>${esc(u)}</option>`)
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="g-action">${esc(t("g.action"))}</label>
            <select id="g-action">
              <option value="">${esc(t("g.allActions"))}</option>
              ${ACTIONS.map(
                (a) => `<option value="${a}"${a === etat.action ? " selected" : ""}>${esc(actionLabel(a))}</option>`
              ).join("")}
            </select>
          </div>
          <div class="field">
            <label for="g-du">${esc(t("common.from"))}</label>
            <input id="g-du" type="date" value="${esc(etat.du)}" />
          </div>
          <div class="field">
            <label for="g-au">${esc(t("common.to"))}</label>
            <input id="g-au" type="date" value="${esc(etat.au)}" />
          </div>
        </div>
        <div class="row row--between">
          <span class="small muted">${esc(t("g.count", { n: lignes.length }))}</span>
          <button class="linkish small" type="button" data-reset-filtres>${esc(t("common.reset"))}</button>
        </div>
      </div>
      <div class="section">
        ${lignes.length === 0 ? `<div class="empty">${esc(t("g.empty"))}</div>` : lignes.map(rendreLigne).join("")}
      </div>`;
  },

  monter({ root }) {
    root.querySelector("#g-utilisateur")?.addEventListener("change", (e) => {
      etat.utilisateur = e.target.value;
      rerendre();
    });
    root.querySelector("#g-action")?.addEventListener("change", (e) => {
      etat.action = e.target.value;
      rerendre();
    });
    root.querySelector("#g-du")?.addEventListener("change", (e) => {
      etat.du = e.target.value;
      rerendre();
    });
    root.querySelector("#g-au")?.addEventListener("change", (e) => {
      etat.au = e.target.value;
      rerendre();
    });
    root.querySelector("[data-reset-filtres]")?.addEventListener("click", () => {
      etat.utilisateur = "";
      etat.action = "";
      etat.du = "";
      etat.au = "";
      rerendre();
    });
    root.querySelector("[data-export]")?.addEventListener("click", exporter);
    void getState();
  },
};
