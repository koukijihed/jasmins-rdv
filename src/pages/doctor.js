// Espace médecin : planning du jour en temps réel, blocage des absences.

import { t, getLang, fmtDate, fmtDateLong, fmtDateTime } from "../i18n.js";
import { esc, badge, toast, nomComplet, age, nomMedecin, etageTexte, motifTexte } from "../ui.js";
import { rerendre } from "../router.js";
import {
  getState,
  medecin as trouverMedecin,
  specialite as trouverSpecialite,
  patient as trouverPatient,
  rdvDuJour,
  rdvImpactesParIndisponibilite,
  creerIndisponibilite,
  supprimerIndisponibilite,
  indisponibilitesMedecin,
  consulterPatient,
  consentementPatient,
  ErreurMetier,
} from "../db.js";
import { todayISO } from "../slots.js";
import { jourDemoParDefaut } from "../seed.js";

const etat = {
  date: jourDemoParDefaut(),
  detail: "",
  erreur: "",
  blocOuvert: false,
  preview: null,
  form: {
    date: todayISO(),
    recurrence: "aucune",
    date_fin: "",
    journee: false,
    heure_debut: "09:00",
    heure_fin: "13:00",
    motif: "",
  },
  dernierLog: "",
};

function nomSpecialite(s) {
  return s ? (getLang() === "ar" ? s.nom_ar : s.nom_fr) : "";
}

function lignePlanning(r, medecinId) {
  const p = trouverPatient(r.patient_id);
  const ouvert = etat.detail === r.id;
  const consentement = p ? consentementPatient(p.id) : null;

  return `
    <article class="rdv rdv--${esc(r.statut)}">
      <div class="rdv__time">${esc(r.heure)}</div>
      <div class="rdv__main">
        <strong>${esc(nomComplet(p) || "—")}</strong>
        <span class="rdv__meta">${esc(motifTexte(r.motif, trouverSpecialite(r.specialite_id)) || "—")}</span>
        <span class="rdv__meta">${esc(t(`canal.${r.canal}`))}</span>
      </div>
      <div class="rdv__actions">
        ${badge(r.statut)}
        <button class="btn btn--small btn--secondary" type="button" data-detail="${r.id}" aria-expanded="${ouvert}">
          ${esc(t("common.details"))}
        </button>
      </div>
      ${
        ouvert
          ? `<div class="alert" style="flex:1 1 100%;margin:8px 0 0">
               <div class="log-grid">
                 <p class="kv"><span class="kv__k">${esc(t("p.mobile"))}</span><span class="kv__v" dir="ltr">${esc(p?.mobile || "—")}</span></p>
                 <p class="kv"><span class="kv__k">${esc(t("p.birth"))}</span><span class="kv__v">${esc(p?.naissance || "—")}${p?.naissance ? ` (${esc(String(age(p)))})` : ""}</span></p>
                 <p class="kv"><span class="kv__k">${esc(t("p.consent.title"))}</span><span class="kv__v">${
                   consentement ? esc(`${fmtDateTime(consentement.date)} · ${consentement.version}`) : esc(t("p.consent.none"))
                 }</span></p>
               </div>
               <p class="xs muted" style="margin:8px 0 0">${esc(t("p.account.traced"))}</p>
             </div>`
          : ""
      }
    </article>`;
}

function rendreAbsences(medecinId) {
  const absences = indisponibilitesMedecin(medecinId);
  return `
    <section class="card" style="margin-top:12px">
      <div class="card__head">
        <h2>${esc(t("d.absences"))}</h2>
        <button class="btn btn--small btn--secondary" type="button" data-toggle-bloc>
          ${etat.blocOuvert ? esc(t("common.close")) : esc(t("d.block"))}
        </button>
      </div>
      ${
        absences.length === 0
          ? `<p class="muted small">${esc(t("d.noAbsence"))}</p>`
          : `<div class="rdv-list">
              ${absences
                .map(
                  (i) => `
                <div class="rdv">
                  <div class="rdv__main">
                    <strong>${esc(fmtDate(i.date))}${i.recurrence === "hebdo" ? ` → ${esc(fmtDate(i.date_fin))}` : ""}</strong>
                    <span class="rdv__meta">${esc(i.journee ? t("d.wholeDay") : `${i.heure_debut}–${i.heure_fin}`)} · ${esc(i.motif || "—")}</span>
                  </div>
                  <div class="rdv__actions">
                    ${i.recurrence === "hebdo" ? `<span class="badge">${esc(t("d.recurring"))}</span>` : ""}
                    <button class="btn btn--small btn--ghost" type="button" data-supprimer-ind="${i.id}">${esc(t("d.remove"))}</button>
                  </div>
                </div>`
                )
                .join("")}
            </div>`
      }
      ${etat.blocOuvert ? rendreFormulaireBlocage() : ""}
    </section>`;
}

function rendreFormulaireBlocage() {
  return `
    <form data-form="blocage" class="section" novalidate>
      <h3>${esc(t("d.block.title"))}</h3>
      <p class="small muted">${esc(t("d.block.hint"))}</p>
      ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
      <div class="grid grid--2">
        <div class="field">
          <label for="bl-date">${esc(t("d.date"))}</label>
          <input id="bl-date" type="date" value="${esc(etat.form.date)}" min="${todayISO()}" required />
        </div>
        <div class="field">
          <label for="bl-motif">${esc(t("d.reason"))}</label>
          <input id="bl-motif" type="text" value="${esc(etat.form.motif)}" placeholder="${esc(t("d.reason.placeholder"))}" />
        </div>
      </div>
      <div class="check" style="margin-bottom:10px">
        <input id="bl-recurrence" type="checkbox" ${etat.form.recurrence === "hebdo" ? "checked" : ""} />
        <label for="bl-recurrence">${esc(t("d.recurring"))}</label>
      </div>
      <div class="field" id="bl-datefin-field" style="${etat.form.recurrence === "hebdo" ? "" : "display:none"}">
        <label for="bl-datefin">${esc(t("d.until"))}</label>
        <input id="bl-datefin" type="date" value="${esc(etat.form.date_fin)}" min="${todayISO()}" />
      </div>
      <div class="check" style="margin-bottom:10px">
        <input id="bl-journee" type="checkbox" ${etat.form.journee ? "checked" : ""} />
        <label for="bl-journee">${esc(t("d.allDay"))}</label>
      </div>
      <div class="grid grid--2" id="bl-heures" style="${etat.form.journee ? "display:none" : ""}">
        <div class="field">
          <label for="bl-debut">${esc(t("d.start"))}</label>
          <input id="bl-debut" type="time" value="${esc(etat.form.heure_debut)}" step="1200" />
        </div>
        <div class="field">
          <label for="bl-fin">${esc(t("d.end"))}</label>
          <input id="bl-fin" type="time" value="${esc(etat.form.heure_fin)}" step="1200" />
        </div>
      </div>
      ${
        etat.preview
          ? `<div class="alert ${etat.preview.count ? "alert--warn" : "alert--info"}">
               <p style="margin-bottom:8px">${
                 etat.preview.count
                   ? esc(
                       etat.preview.count === 1
                         ? t("d.affected.one")
                         : t("d.affected", { n: etat.preview.count })
                     )
                   : esc(t("d.noneAffected"))
               }</p>
               ${
                 etat.preview.noms.length
                   ? `<ul class="small" style="margin:0 0 8px 18px;padding:0">${etat.preview.noms
                       .map((n) => `<li>${esc(n)}</li>`)
                       .join("")}</ul>`
                   : ""
               }
               <button class="btn btn--small" type="button" data-confirm-blocage>${esc(t("d.confirm"))}</button>
             </div>`
          : ""
      }
      <div class="row">
        <button class="btn btn--secondary" type="button" data-preview-blocage>${esc(t("d.preview"))}</button>
      </div>
    </form>`;
}

function collecterBlocage(root) {
  return {
    date: root.querySelector("#bl-date")?.value || "",
    recurrence: root.querySelector("#bl-recurrence")?.checked ? "hebdo" : "aucune",
    date_fin: root.querySelector("#bl-datefin")?.value || "",
    journee: Boolean(root.querySelector("#bl-journee")?.checked),
    heure_debut: root.querySelector("#bl-debut")?.value || "09:00",
    heure_fin: root.querySelector("#bl-fin")?.value || "13:00",
    motif: root.querySelector("#bl-motif")?.value.trim() || "",
  };
}

function validerBlocage(d) {
  if (!d.date || d.date < todayISO()) return t("d.invalidDate");
  if (d.recurrence === "hebdo" && (!d.date_fin || d.date_fin < d.date)) return t("d.invalidDate");
  if (!d.journee && d.heure_debut >= d.heure_fin) return t("d.invalid");
  return "";
}

export default {
  rendre({ session }) {
    const medecinId = session.medecinId;
    const med = trouverMedecin(medecinId);
    if (!med) return `<div class="alert alert--error">${esc(t("common.error"))}</div>`;
    const liste = rdvDuJour(etat.date, medecinId);
    const spec = trouverSpecialite(med.specialite_id);

    return `
      <div class="page-head">
        <div class="page-head__text">
          <p class="eyebrow">${esc(nomMedecin(med))} · ${esc(nomSpecialite(spec))}</p>
          <h1>${esc(t("d.title"))}</h1>
          <p class="muted" style="margin:4px 0 0">${esc(t("d.today", { date: fmtDateLong(etat.date) }))}</p>
        </div>
        <div class="page-head__actions">
          <span class="badge badge--present">${esc(t("d.live"))}</span>
        </div>
      </div>
      <div class="row" style="margin-bottom:12px">
        <div class="field" style="margin:0;flex:1 1 180px">
          <label for="planning-date">${esc(t("d.date"))}</label>
          <input id="planning-date" type="date" value="${esc(etat.date)}" />
        </div>
        <button class="btn btn--secondary" type="button" data-planning-today style="margin-top:22px">${esc(t("common.today"))}</button>
      </div>
      <p class="small muted">${esc(t("d.count", { n: liste.length }))} · ${esc(etageTexte(med.etage))}</p>
      <div class="rdv-list" style="margin-top:8px">
        ${liste.length === 0 ? `<div class="empty">${esc(t("d.noAppt"))}</div>` : liste.map((r) => lignePlanning(r, medecinId)).join("")}
      </div>
      ${etat.erreur && !etat.blocOuvert ? `<div class="alert alert--error" style="margin-top:12px">${esc(etat.erreur)}</div>` : ""}
      ${rendreAbsences(medecinId)}
    `;
  },

  monter({ root, session, rafraichir }) {
    const medecinId = session.medecinId;

    root.querySelector("#planning-date")?.addEventListener("change", (e) => {
      etat.date = e.target.value || todayISO();
      etat.detail = "";
      rerendre();
    });
    root.querySelector("[data-planning-today]")?.addEventListener("click", () => {
      etat.date = jourDemoParDefaut();
      etat.detail = "";
      rerendre();
    });

    root.querySelectorAll("[data-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.detail;
        etat.detail = etat.detail === id ? "" : id;
        if (etat.detail) {
          const r = getState().rendezVous.find((x) => x.id === id);
          const cle = `medecin:${r?.patient_id}:${id}`;
          if (r && etat.dernierLog !== cle) {
            etat.dernierLog = cle;
            consulterPatient(r.patient_id, { nom: session.nom, role: "medecin" });
          }
        }
        rerendre();
      });
    });

    root.querySelector("[data-toggle-bloc]")?.addEventListener("click", () => {
      etat.blocOuvert = !etat.blocOuvert;
      etat.preview = null;
      etat.erreur = "";
      rerendre();
    });

    root.querySelector("#bl-journee")?.addEventListener("change", (e) => {
      etat.form = { ...etat.form, ...collecterBlocage(root), journee: e.target.checked };
      etat.preview = null;
      rerendre();
    });
    root.querySelector("#bl-recurrence")?.addEventListener("change", (e) => {
      etat.form = { ...etat.form, ...collecterBlocage(root), recurrence: e.target.checked ? "hebdo" : "aucune" };
      etat.preview = null;
      rerendre();
    });

    root.querySelector("[data-preview-blocage]")?.addEventListener("click", () => {
      const d = collecterBlocage(root);
      etat.form = d;
      const erreur = validerBlocage(d);
      etat.erreur = erreur;
      etat.preview = null;
      if (!erreur) {
        const impactes = rdvImpactesParIndisponibilite({
          medecinId,
          date: d.date,
          date_fin: d.recurrence === "hebdo" ? d.date_fin : d.date,
          recurrence: d.recurrence,
          journee: d.journee,
          heure_debut: d.heure_debut,
          heure_fin: d.heure_fin,
        });
        etat.preview = {
          count: impactes.length,
          noms: impactes.map((r) => {
            const p = trouverPatient(r.patient_id);
            return `${r.date} ${r.heure} — ${nomComplet(p)}`;
          }),
          params: d,
        };
      }
      rerendre();
    });

    root.querySelector("[data-confirm-blocage]")?.addEventListener("click", () => {
      const params = etat.preview?.params;
      if (!params) return;
      try {
        const res = creerIndisponibilite({ medecinId, ...params }, { nom: session.nom, role: "medecin" });
        toast(
          res.impactes === 0 ? t("d.blockedNone") : t("d.blocked", { n: res.impactes })
        );
        etat.blocOuvert = false;
        etat.preview = null;
        etat.form = { ...etat.form, motif: "", date_fin: "" };
        etat.erreur = "";
        rafraichir();
      } catch (err) {
        etat.erreur = err instanceof ErreurMetier ? t("common.error") : t("common.error");
        rerendre();
      }
    });

    root.querySelectorAll("[data-supprimer-ind]").forEach((btn) => {
      btn.addEventListener("click", () => {
        try {
          supprimerIndisponibilite(btn.dataset.supprimerInd, { nom: session.nom, role: "medecin" });
          toast(t("d.removed"));
          rerendre();
        } catch {
          toast(t("common.error"), "error");
        }
      });
    });
  },
};
