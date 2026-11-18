// Espace secrétaire / accueil : agenda partagé, saisie rapide, pointage, recherche.

import { t, getLang, fmtDate, fmtDateLong, fmtDateTime, fmtNumber } from "../i18n.js";
import { esc, badge, badgeCanal, toast, nomComplet, age, nomMedecin, etageTexte, motifTexte } from "../ui.js";
import { naviguer, rerendre } from "../router.js";
import {
  getState,
  medecin as trouverMedecin,
  specialite as trouverSpecialite,
  patient as trouverPatient,
  rdvDuJour,
  rdvDuPatient,
  creneauxDisponibles,
  pointerRdv,
  creerRdv,
  creerPatient,
  patientParMobile,
  tauxNoShow,
  consulterPatient,
  consentementPatient,
  medecinsDeSpecialite,
  ErreurMetier,
  maintenantISO,
} from "../db.js";
import { rechercherPatients } from "../search.js";
import { todayISO, estJourOuvre, creneauDeId, parseISODate, addDaysISO } from "../slots.js";
import { jourDemoParDefaut } from "../seed.js";

const etat = {
  date: jourDemoParDefaut(),
  medecinId: "",
  recherche: "",
  resultats: [],
  erreur: "",
  dernierLog: "",
};

const creation = {
  patientId: "",
  prenom: "",
  nom: "",
  mobile: "",
  specialiteId: "cardio",
  medecinId: "dr-gharbi",
  date: jourDemoParDefaut(),
  heure: "",
  motif: "",
  canal: "telephone",
  recherche: "",
  resultats: [],
  erreur: "",
  info: "",
};

function nomSpecialite(s) {
  return s ? (getLang() === "ar" ? s.nom_ar : s.nom_fr) : "";
}

function initCreationDepuisAgenda() {
  creation.erreur = "";
  creation.info = "";
  creation.patientId = "";
  creation.date = etat.date;
  if (etat.medecinId) {
    creation.medecinId = etat.medecinId;
    creation.specialiteId = trouverMedecin(etat.medecinId)?.specialite_id || "cardio";
  }
  creation.heure = "";
}

/* ------------------------------------------------------------------ */
/* Recherche de patient (toujours visible)                             */

function blocRecherche() {
  return `
    <form data-form="recherche" class="card card--flat" style="margin-bottom:12px" role="search">
      <div class="field" style="margin:0">
        <label for="rech-patient">${esc(t("s.search"))}</label>
        <div class="row" style="flex-wrap:nowrap">
          <input id="rech-patient" name="q" type="search" value="${esc(etat.recherche)}"
            placeholder="${esc(t("s.search.placeholder"))}" autocomplete="off" />
          <button class="btn" type="submit">${esc(t("common.search"))}</button>
        </div>
        <span class="field__hint">${esc(t("s.search.hint"))}</span>
      </div>
      <div id="resultats-recherche" aria-live="polite">${rendreResultatsRecherche(etat.resultats)}</div>
    </form>`;
}

function rendreResultatsRecherche(resultats) {
  if (!resultats.length) return "";
  return `
    <div class="rdv-list" style="margin-top:10px">
      ${resultats
        .map(
          ({ patient }) => `
        <a class="rdv" href="#/secretaire/patient/${encodeURIComponent(patient.id)}" style="text-decoration:none;color:inherit">
          <div class="rdv__main">
            <strong>${esc(nomComplet(patient))}</strong>
            <span class="rdv__meta" dir="ltr">${esc(patient.mobile)}</span>
          </div>
          <span class="badge">${esc(t("s.lookup"))}</span>
        </a>`
        )
        .join("")}
    </div>`;
}

function majResultatsRecherche(root) {
  const q = root.querySelector("#rech-patient")?.value || "";
  etat.recherche = q;
  etat.resultats = rechercherPatients(q);
  const cible = root.querySelector("#resultats-recherche");
  if (cible) cible.innerHTML = rendreResultatsRecherche(etat.resultats);
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */

function choisirRdvs() {
  return rdvDuJour(etat.date, etat.medecinId || null);
}

function rendreAgenda() {
  const s = getState();
  const liste = choisirRdvs();
  const stats = tauxNoShow();
  const maintenant = new Date();
  const restants = liste.filter((r) => r.statut === "reserve" && new Date(`${r.date}T${r.heure}:00`) > maintenant).length;
  const docteurFiltre = etat.medecinId ? trouverMedecin(etat.medecinId) : null;

  return `
    <div class="page-head">
      <div class="page-head__text">
        <h1>${esc(t("s.title"))}</h1>
        <p class="muted" style="margin:4px 0 0">${esc(t("s.subtitle"))}</p>
      </div>
      <div class="page-head__actions">
        <a class="btn" href="#/secretaire/nouveau" data-nouveau>${esc(t("s.new"))}</a>
      </div>
    </div>
    ${blocRecherche()}
    ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
    <div class="grid grid--stats" style="margin-bottom:12px">
      <div class="stat">
        <div class="stat__value">${fmtNumber(liste.length)}</div>
        <div class="stat__label">${esc(t("s.apptCount"))}</div>
      </div>
      <div class="stat">
        <div class="stat__value">${fmtNumber(restants)}</div>
        <div class="stat__label">${esc(t("s.remaining"))}</div>
      </div>
      <div class="stat">
        <div class="stat__value">${fmtNumber(stats.taux * 100)} %</div>
        <div class="stat__label">${esc(t("s.noShow"))} · ${fmtNumber(stats.absents)}/${fmtNumber(stats.total)}</div>
      </div>
    </div>
    <div class="card card--flat">
      <div class="filters">
        <div class="field">
          <label for="agenda-date">${esc(t("s.day"))}</label>
          <input id="agenda-date" type="date" value="${esc(etat.date)}" />
        </div>
        <div class="field">
          <label for="agenda-medecin">${esc(t("p.doctor"))}</label>
          <select id="agenda-medecin">
            <option value="">${esc(t("s.allDoctors"))}</option>
            ${s.medecins
              .map(
                (m) =>
                  `<option value="${m.id}"${m.id === etat.medecinId ? " selected" : ""}>${esc(nomMedecin(m))} — ${esc(
                    nomSpecialite(trouverSpecialite(m.specialite_id))
                  )}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field">
          <span class="field__label">${esc(t("s.today"))}</span>
          <button class="btn btn--secondary" type="button" data-aujourdhui>${esc(t("s.today"))}</button>
        </div>
      </div>
      <div class="row row--between" style="margin-top:4px">
        <h2 style="margin:0;font-size:1.05rem">${esc(fmtDateLong(etat.date))}</h2>
        ${docteurFiltre ? `<span class="badge">${esc(nomMedecin(docteurFiltre))}</span>` : ""}
      </div>
    </div>
    <div class="rdv-list" style="margin-top:12px">
      ${
        liste.length === 0
          ? `<div class="empty">${esc(t("s.noAppt"))}</div>`
          : liste.map((r) => ligneAgenda(r)).join("")
      }
    </div>`;
}

function ligneAgenda(r) {
  const p = trouverPatient(r.patient_id);
  const m = trouverMedecin(r.medecin_id);
  const spec = trouverSpecialite(r.specialite_id);
  const statuts = [
    ["present", "s.present"],
    ["retard", "s.late"],
    ["absent", "s.absent"],
  ];
  return `
    <article class="rdv rdv--${esc(r.statut)}">
      <div class="rdv__time">${esc(r.heure)}</div>
      <div class="rdv__main">
        <strong><a href="#/secretaire/patient/${encodeURIComponent(r.patient_id)}" style="color:inherit">${esc(nomComplet(p) || "—")}</a></strong>
        <span class="rdv__meta">${esc(nomMedecin(m))} · ${esc(nomSpecialite(spec))}${etat.medecinId ? "" : ` · ${esc(etageTexte(m?.etage))}`}</span>
        <span class="rdv__meta" dir="ltr">${esc(p?.mobile || "")}</span>
      </div>
      <div class="rdv__actions">
        ${badge(r.statut)}
        ${badgeCanal(r.canal)}
      </div>
      <div class="rdv__actions" style="flex:1 1 100%" role="group" aria-label="${esc(t("s.checkin") + " — " + nomComplet(p))}">
        ${statuts
          .map(
            ([statut, cle]) => `
          <button class="btn btn--small ${r.statut === statut ? "" : "btn--secondary"}" type="button"
            data-pointer="${r.id}" data-statut="${statut}" aria-pressed="${r.statut === statut}">
            ${esc(t(cle))}
          </button>`
          )
          .join("")}
        <span class="spacer"></span>
        <span class="xs muted">${esc(motifTexte(r.motif, spec))}</span>
      </div>
    </article>`;
}

/* ------------------------------------------------------------------ */
/* Fiche patient                                                       */

function rendreFiche(patientId) {
  const p = trouverPatient(patientId);
  if (!p) return `<div class="alert alert--error">${esc(t("common.error"))}</div>`;
  const rendezVous = rdvDuPatient(p.id);
  const consentement = consentementPatient(p.id);

  return `
    <div class="page-head">
      <div class="page-head__text">
        <a class="linkish small" href="#/secretaire">← ${esc(t("s.lookup.back"))}</a>
        <h1 style="margin-top:8px">${esc(nomComplet(p))}</h1>
        <p class="muted" style="margin:4px 0 0" dir="ltr">${esc(p.mobile)}</p>
      </div>
      <div class="page-head__actions">
        <button class="btn" type="button" data-rdv-patient>${esc(t("s.new"))}</button>
      </div>
    </div>
    ${blocRecherche()}
    <div class="grid grid--2" style="margin-top:12px">
      <section class="card">
        <h2>${esc(t("s.lookup"))}</h2>
        <div class="log-grid">
          <p class="kv"><span class="kv__k">${esc(t("p.birth"))}</span><span class="kv__v">${esc(p.naissance || "—")}${p.naissance ? ` (${esc(String(age(p)))})` : ""}</span></p>
          <p class="kv"><span class="kv__k">${esc(t("p.address"))}</span><span class="kv__v">${esc(p.adresse || "—")}</span></p>
          <p class="kv"><span class="kv__k">${esc(t("lang.label"))}</span><span class="kv__v">${p.langue === "ar" ? "العربية" : "Français"}</span></p>
          <p class="kv"><span class="kv__k">${esc(t("s.source"))}</span><span class="kv__v">${esc(p.source === "web" ? t("canal.web") : p.source)}</span></p>
          <p class="kv"><span class="kv__k">${esc(t("p.consent.title"))}</span><span class="kv__v">${
            consentement
              ? esc(t("p.consent.given", { date: fmtDateTime(consentement.date), version: consentement.version }))
              : esc(t("p.consent.none"))
          }</span></p>
          <p class="kv"><span class="kv__k">${esc(t("s.lookup.created"))}</span><span class="kv__v">${esc(fmtDateTime(p.cree_le))}</span></p>
        </div>
        <p class="xs muted" style="margin-top:12px">${esc(t("p.account.traced"))}</p>
      </section>
      <section class="card">
        <h2>${esc(t("s.lookup.appts"))}</h2>
        ${
          rendezVous.length === 0
            ? `<p class="muted small">${esc(t("s.lookup.noAppts"))}</p>`
            : `<div class="rdv-list">
                ${rendezVous
                  .map(
                    (r) => `
                  <div class="rdv">
                    <div class="rdv__main">
                      <strong>${esc(fmtDate(r.date))} · ${esc(r.heure)}</strong>
                      <span class="rdv__meta">${esc(nomMedecin(trouverMedecin(r.medecin_id)))} · ${esc(motifTexte(r.motif, trouverSpecialite(r.specialite_id)))}</span>
                    </div>
                    <div class="rdv__actions">${badge(r.statut)} ${badgeCanal(r.canal)}</div>
                  </div>`
                  )
                  .join("")}
              </div>`
        }
      </section>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Saisie d'un rendez-vous                                             */

function creationInitialisee() {
  if (!creation.specialiteId) creation.specialiteId = "cardio";
  const medecins = medecinsDeSpecialite(creation.specialiteId);
  if (!creation.medecinId || !medecins.some((m) => m.id === creation.medecinId)) {
    creation.medecinId = medecins[0]?.id || "";
  }
  if (creation.patientId && !trouverPatient(creation.patientId)) creation.patientId = "";
  creation.resultats = creation.recherche ? rechercherPatients(creation.recherche) : [];

  // Si la journée choisie n'a plus de créneau (fin de journée), proposer le jour ouvré suivant.
  if (!creation.heure) {
    const aujourdhui = todayISO();
    for (let i = 0; i < 14; i += 1) {
      const date = addDaysISO(aujourdhui, i);
      if (!estJourOuvre(date)) continue;
      const dispo = creneauxDisponibles({
        specialiteId: creation.specialiteId,
        medecinId: creation.medecinId,
        dateDebut: date,
        jours: 1,
      });
      if (dispo.length) {
        if (i > 0 && creation.date <= aujourdhui) creation.date = date;
        break;
      }
    }
  }
}

function rendreCreation() {
  creationInitialisee();
  const s = getState();
  const medecins = medecinsDeSpecialite(creation.specialiteId);
  const patientChoisi = creation.patientId ? trouverPatient(creation.patientId) : null;
  const dispo = creneauxDisponibles({
    specialiteId: creation.specialiteId,
    medecinId: creation.medecinId,
    dateDebut: creation.date,
    jours: 1,
  });
  const creneaux = dispo[0]?.creneaux || [];
  const heuresPrises = s.rendezVous.filter(
    (r) => r.statut === "reserve" && r.date === creation.date && r.medecin_id === creation.medecinId
  );

  return `
    <div class="page-head">
      <div class="page-head__text">
        <a class="linkish small" href="#/secretaire">← ${esc(t("s.lookup.back"))}</a>
        <h1 style="margin-top:8px">${esc(t("s.create.title"))}</h1>
        <p class="muted" style="margin:4px 0 0">${esc(t("s.create.hint"))}</p>
      </div>
    </div>
    ${creation.erreur ? `<div class="alert alert--error" role="alert">${esc(creation.erreur)}</div>` : ""}
    ${creation.info ? `<div class="alert alert--info">${esc(creation.info)}</div>` : ""}
    <form data-form="creation" novalidate>
      <section class="card">
        <div class="card__head"><h2>${esc(t("s.create.patient"))}</h2></div>
        ${
          patientChoisi
            ? `<div class="alert alert--ok">
                 <div class="row row--between">
                   <div>
                     <strong>${esc(nomComplet(patientChoisi))}</strong><br/>
                     <span class="small" dir="ltr">${esc(patientChoisi.mobile)}</span>
                   </div>
                   <button class="btn btn--small btn--secondary" type="button" data-changer-patient>${esc(t("s.change"))}</button>
                 </div>
               </div>`
            : `<div class="field">
                 <label for="cre-recherche">${esc(t("s.create.find"))}</label>
                 <input id="cre-recherche" type="search" value="${esc(creation.recherche)}" placeholder="${esc(t("s.search.placeholder"))}" autocomplete="off" />
                 <span class="field__hint">${esc(t("s.search.hint"))}</span>
                 <div id="resultats-creation" aria-live="polite">${rendreResultatsCreation(creation.resultats)}</div>
               </div>
               <div class="grid grid--2">
                 <div class="field">
                   <label for="cre-prenom">${esc(t("s.create.firstName"))}</label>
                   <input id="cre-prenom" type="text" value="${esc(creation.prenom)}" autocomplete="off" />
                 </div>
                 <div class="field">
                   <label for="cre-nom">${esc(t("s.create.lastName"))}</label>
                   <input id="cre-nom" type="text" value="${esc(creation.nom)}" autocomplete="off" />
                 </div>
               </div>
               <div class="field">
                 <label for="cre-mobile">${esc(t("s.create.mobile"))}</label>
                 <input id="cre-mobile" type="tel" dir="ltr" value="${esc(creation.mobile)}" autocomplete="off" />
                 <span class="field__hint">${esc(t("login.mobile.hint"))}</span>
               </div>`
        }
      </section>

      <section class="card">
        <div class="card__head"><h2>${esc(t("p.slot"))}</h2></div>
        <div class="grid grid--2">
          <div class="field">
            <label for="cre-specialite">${esc(t("s.create.specialty"))}</label>
            <select id="cre-specialite">
              ${s.specialites
                .map(
                  (sp) =>
                    `<option value="${sp.id}"${sp.id === creation.specialiteId ? " selected" : ""}>${esc(nomSpecialite(sp))}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="cre-medecin">${esc(t("s.create.doctor"))}</label>
            <select id="cre-medecin">
              ${medecins.map((m) => `<option value="${m.id}"${m.id === creation.medecinId ? " selected" : ""}>${esc(nomMedecin(m))}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="cre-date">${esc(t("p.dateFrom"))}</label>
          <input id="cre-date" type="date" value="${esc(creation.date)}" min="${todayISO()}" />
        </div>
        <p class="small muted">${esc(t("s.create.slot"))} — ${esc(fmtDateLong(creation.date))}</p>
        <div class="chips" role="group" aria-label="${esc(t("s.create.slot"))}">
          ${
            creneaux.length
              ? creneaux
                  .map(
                    (c) => `<button class="chip chip--slot" type="button" data-cre-slot="${esc(c.id)}"
                      aria-pressed="${creation.heure === c.heure}">${esc(c.heure)}</button>`
                  )
                  .join("")
              : `<p class="muted small">${esc(t("s.noAppt"))}</p>`
          }
        </div>
        ${
          heuresPrises.length
            ? `<p class="xs muted" style="margin-top:8px">${esc(
                heuresPrises
                  .map((r) => `${r.heure} ${t("s.slot.taken").toLowerCase()}`)
                  .join(" · ")
              )}</p>`
            : ""
        }
        <div class="field" style="margin-top:12px">
          <label for="cre-motif">${esc(t("s.reason"))}</label>
          <input id="cre-motif" type="text" value="${esc(creation.motif)}" maxlength="120" />
        </div>
        <fieldset class="field" style="border:0;padding:0">
          <legend class="field__label">${esc(t("s.channel"))}</legend>
          <div class="row">
            <label class="check" style="flex:1 1 140px;cursor:pointer">
              <input type="radio" name="canal" value="telephone" ${creation.canal === "telephone" ? "checked" : ""} />
              <span>${esc(t("canal.telephone"))}</span>
            </label>
            <label class="check" style="flex:1 1 140px;cursor:pointer">
              <input type="radio" name="canal" value="guichet" ${creation.canal === "guichet" ? "checked" : ""} />
              <span>${esc(t("canal.guichet"))}</span>
            </label>
          </div>
        </fieldset>
      </section>

      <div class="row" style="margin-top:12px">
        <button class="btn" type="submit">${esc(t("s.create.submit"))}</button>
        <a class="btn btn--ghost" href="#/secretaire">${esc(t("common.cancel"))}</a>
      </div>
    </form>`;
}

function rendreResultatsCreation(resultats) {
  if (!resultats.length) return "";
  return `
    <div class="rdv-list" style="margin-top:8px">
      ${resultats
        .map(
          ({ patient }) => `
        <button class="rdv" type="button" data-choisir-patient="${patient.id}" style="cursor:pointer;text-align:start;width:100%;font:inherit">
          <div class="rdv__main">
            <strong>${esc(nomComplet(patient))}</strong>
            <span class="rdv__meta" dir="ltr">${esc(patient.mobile)}</span>
          </div>
          <span class="badge">${esc(t("common.next"))}</span>
        </button>`
        )
        .join("")}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */

export default {
  rendre({ route, session }) {
    const sous = route.segments[0] || "";
    if (sous === "nouveau") return rendreCreation();
    if (sous === "patient") return rendreFiche(route.segments[1] || "");
    return rendreAgenda();
  },

  monter({ root, route, session }) {
    const sous = route.segments[0] || "";

    // Recherche toujours visible.
    const formRech = root.querySelector('form[data-form="recherche"]');
    if (formRech) {
      const champ = formRech.querySelector("#rech-patient");
      champ?.addEventListener("input", () => majResultatsRecherche(root));
      formRech.addEventListener("submit", (e) => {
        e.preventDefault();
        majResultatsRecherche(root);
        if (etat.resultats.length) {
          naviguer(`#/secretaire/patient/${encodeURIComponent(etat.resultats[0].patient.id)}`);
        }
      });
    }

    // Agenda.
    if (sous === "") {
      root.querySelector("#agenda-date")?.addEventListener("change", (e) => {
        etat.date = e.target.value || todayISO();
        rerendre();
      });
      root.querySelector("#agenda-medecin")?.addEventListener("change", (e) => {
        etat.medecinId = e.target.value;
        rerendre();
      });
      root.querySelector("[data-aujourdhui]")?.addEventListener("click", () => {
        etat.date = jourDemoParDefaut();
        rerendre();
      });
      root.querySelector("[data-nouveau]")?.addEventListener("click", () => {
        initCreationDepuisAgenda();
      });
      root.querySelectorAll("[data-pointer]").forEach((btn) => {
        btn.addEventListener("click", () => {
          try {
            pointerRdv(btn.dataset.pointer, btn.dataset.statut, { nom: "Salma Trabelsi", role: "secretaire" });
            toast(t("s.checked", { status: t(`st.${btn.dataset.statut}`) }));
            rerendre();
          } catch {
            toast(t("common.error"), "error");
          }
        });
      });
    }

    // Fiche patient.
    if (sous === "patient") {
      const patientId = route.segments[1] || "";
      const cle = `secretaire:${patientId}`;
      if (etat.dernierLog !== cle) {
        etat.dernierLog = cle;
        if (trouverPatient(patientId)) {
          consulterPatient(patientId, { nom: "Salma Trabelsi", role: "secretaire" });
        }
      }
      root.querySelector("[data-rdv-patient]")?.addEventListener("click", () => {
        creation.patientId = patientId;
        const p = trouverPatient(patientId);
        creation.prenom = p?.prenom || "";
        creation.nom = p?.nom || "";
        creation.mobile = p?.mobile || "";
        creation.erreur = "";
        creation.info = "";
        creation.date = todayISO();
        creation.heure = "";
        naviguer("#/secretaire/nouveau");
      });
    }

    // Création d'un rendez-vous.
    if (sous === "nouveau") {
      const form = root.querySelector('form[data-form="creation"]');
      const champRech = root.querySelector("#cre-recherche");
      champRech?.addEventListener("input", () => {
        creation.recherche = champRech.value;
        creation.resultats = rechercherPatients(champRech.value);
        const cible = root.querySelector("#resultats-creation");
        if (cible) cible.innerHTML = rendreResultatsCreation(creation.resultats);
        root.querySelectorAll("[data-choisir-patient]").forEach((btn) => {
          btn.onclick = () => {
            creation.patientId = btn.dataset.choisirPatient;
            creation.erreur = "";
            rerendre();
          };
        });
      });
      root.querySelectorAll("[data-choisir-patient]").forEach((btn) => {
        btn.addEventListener("click", () => {
          creation.patientId = btn.dataset.choisirPatient;
          creation.erreur = "";
          rerendre();
        });
      });
      root.querySelector("[data-changer-patient]")?.addEventListener("click", () => {
        creation.patientId = "";
        creation.recherche = "";
        creation.resultats = [];
        rerendre();
      });

      // Conserver la saisie sans re-rendu.
      root.querySelector("#cre-prenom")?.addEventListener("input", (e) => (creation.prenom = e.target.value));
      root.querySelector("#cre-nom")?.addEventListener("input", (e) => (creation.nom = e.target.value));
      root.querySelector("#cre-motif")?.addEventListener("input", (e) => (creation.motif = e.target.value));
      root.querySelector("#cre-mobile")?.addEventListener("input", (e) => (creation.mobile = e.target.value));
      root.querySelector("#cre-mobile")?.addEventListener("blur", () => {
        const mobile = (creation.mobile || "").replace(/[\s.-]/g, "");
        const existant = patientParMobile(mobile);
        if (existant) {
          creation.patientId = existant.id;
          creation.recherche = "";
          creation.resultats = [];
          etat.erreur = "";
          creation.info = t("s.create.existing", { name: nomComplet(existant), phone: existant.mobile });
          rerendre();
        }
      });

      root.querySelector("#cre-specialite")?.addEventListener("change", (e) => {
        creation.specialiteId = e.target.value;
        creation.medecinId = medecinsDeSpecialite(creation.specialiteId)[0]?.id || "";
        creation.heure = "";
        rerendre();
      });
      root.querySelector("#cre-medecin")?.addEventListener("change", (e) => {
        creation.medecinId = e.target.value;
        creation.heure = "";
        rerendre();
      });
      root.querySelector("#cre-date")?.addEventListener("change", (e) => {
        creation.date = e.target.value || todayISO();
        creation.heure = "";
        rerendre();
      });
      root.querySelectorAll("[data-cre-slot]").forEach((btn) => {
        btn.addEventListener("click", () => {
          creation.heure = creneauDeId(btn.dataset.creSlot)?.heure || "";
          creation.erreur = "";
          rerendre();
        });
      });
      root.querySelectorAll('input[name="canal"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          creation.canal = root.querySelector('input[name="canal"]:checked')?.value || "telephone";
        });
      });

      form?.addEventListener("submit", (e) => {
        e.preventDefault();
        creation.prenom = root.querySelector("#cre-prenom")?.value.trim() ?? creation.prenom;
        creation.nom = root.querySelector("#cre-nom")?.value.trim() ?? creation.nom;
        creation.mobile = root.querySelector("#cre-mobile")?.value.trim() ?? creation.mobile;
        creation.motif = root.querySelector("#cre-motif")?.value.trim() ?? creation.motif;
        creation.erreur = "";
        creation.info = "";

        try {
          let patientId = creation.patientId;
          if (!patientId) {
            if (!creation.prenom || !creation.nom || !creation.mobile) {
              creation.erreur = t("s.create.needPatient");
              rerendre();
              return;
            }
            const mobile = creation.mobile.replace(/[\s.-]/g, "");
            if (!/^\+216\d{8}$/.test(mobile)) {
              creation.erreur = t("login.mobile.invalid");
              rerendre();
              return;
            }
            const existant = patientParMobile(mobile);
            if (existant) {
              patientId = existant.id;
            } else {
              const p = creerPatient({
                prenom: creation.prenom,
                nom: creation.nom,
                mobile,
                source: creation.canal,
                langue: getLang(),
              });
              patientId = p.id;
            }
          }
          if (!creation.heure) {
            creation.erreur = t("s.create.needSlot");
            rerendre();
            return;
          }
          const slotId = `${creation.medecinId}|${creation.date}|${creation.heure}`;
          creerRdv({
            patientId,
            creneauId: slotId,
            motif: creation.motif,
            canal: creation.canal,
            consentementId: null,
            utilisateur: { nom: "Salma Trabelsi", role: "secretaire" },
            role: "secretaire",
          });
          etat.date = creation.date;
          etat.medecinId = creation.medecinId;
          etat.erreur = "";
          creation.patientId = "";
          creation.prenom = "";
          creation.nom = "";
          creation.mobile = "";
          creation.heure = "";
          creation.motif = "";
          creation.recherche = "";
          creation.resultats = [];
          creation.info = "";
          toast(t("s.create.done"));
          naviguer("#/secretaire");
        } catch (err) {
          if (err instanceof ErreurMetier && err.code === "creneau_pris") creation.erreur = t("s.create.dupSlot");
          else creation.erreur = t("common.error");
          rerendre();
        }
      });
    }
  },
};
