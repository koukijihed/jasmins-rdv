// Page de connexion de démonstration — 4 espaces, comptes préremplis.

import { t, getLang } from "../i18n.js";
import { esc, toast, nomMedecin, nomSpecialite } from "../ui.js";
import { getState } from "../db.js";
import {
  demanderCode,
  codeDemo,
  verifierCode,
  mobileValide,
  normaliserMobile,
  creerComptePatient,
  seConnecterSecretaire,
  seConnecterMedecin,
  seConnecterDpo,
  seConnecterPatient,
  ErreurAuth,
} from "../auth.js";
import { naviguer } from "../router.js";

const etat = {
  phase: "roles", // roles | mobile | code | create
  mobile: "+216 20 123 456",
  code: "",
  prenom: "",
  nom: "",
  medecinId: "dr-gharbi",
  erreur: "",
  info: "",
};

export function reinitialiserLogin() {
  etat.phase = "roles";
  etat.mobile = "+216 20 123 456";
  etat.code = "";
  etat.prenom = "";
  etat.nom = "";
  etat.erreur = "";
  etat.info = "";
}

function messageErreur(err) {
  if (!(err instanceof ErreurAuth)) return t("common.error");
  if (err.code === "mobile_invalide") return t("login.mobile.invalid");
  if (err.code === "code_incorrect") return t("login.code.wrong", { n: err.details.essai });
  if (err.code === "code_expire") return t("login.code.expired");
  if (err.code === "bloque") return t("login.locked", { min: err.details.minutes });
  return t("common.error");
}

function carteRole({ role, lettre, titre, description, action }) {
  return `
    <article class="card role-card">
      <span class="role-card__icon" aria-hidden="true">${lettre}</span>
      <h2>${esc(titre)}</h2>
      <p>${esc(description)}</p>
      ${action}
    </article>`;
}

function rendreRoles() {
  const medecins = getState().medecins;
  const options = medecins
    .map((m) => `<option value="${m.id}"${m.id === etat.medecinId ? " selected" : ""}>${esc(nomMedecin(m))} — ${esc(
      nomSpecialite(getState().specialites.find((s) => s.id === m.specialite_id))
    )}</option>`)
    .join("");

  return `
    <section class="login-hero">
      <span class="brand__logo">Polyclinique Les Jasmins</span>
      <p class="muted">${esc(t("brand.city"))}</p>
      <h1>${esc(t("login.title"))}</h1>
      <p class="muted">${esc(t("login.subtitle"))}</p>
      <span class="badge badge--reserve">${esc(t("demo.badge"))}</span>
    </section>
    <div class="role-grid">
      ${carteRole({
        role: "patient",
        lettre: "P",
        titre: t("role.patient"),
        description: t("login.patient.desc"),
        action: `<button class="btn btn--block" type="button" data-phase="mobile">${esc(t("login.submit"))}</button>`,
      })}
      ${carteRole({
        role: "secretaire",
        lettre: "S",
        titre: t("role.secretary"),
        description: t("login.secretary.desc"),
        action: `
          <p class="small muted">${esc(t("login.account.secretary"))} · ${esc(t("login.account.hint"))}</p>
          <button class="btn btn--block" type="button" data-connect="secretaire">${esc(t("login.submit"))}</button>`,
      })}
      ${carteRole({
        role: "medecin",
        lettre: "M",
        titre: t("role.doctor"),
        description: t("login.doctor.desc"),
        action: `
          <form data-form="medecin">
            <div class="field">
              <label for="medecin-login">${esc(t("login.doctor.choose"))}</label>
              <select id="medecin-login" name="medecinId">${options}</select>
            </div>
            <button class="btn btn--block" type="submit">${esc(t("login.submit"))}</button>
          </form>`,
      })}
      ${carteRole({
        role: "dpo",
        lettre: "R",
        titre: t("role.dpo"),
        description: t("login.dpo.desc"),
        action: `
          <p class="small muted">${esc(t("login.account.dpo"))} · ${esc(t("login.account.hint"))}</p>
          <button class="btn btn--block" type="button" data-connect="dpo">${esc(t("login.submit"))}</button>`,
      })}
    </div>
    <p class="center small muted" style="margin-top:16px">${esc(t("demo.note"))}</p>`;
}

function rendreMobile() {
  return `
    <div class="card" style="max-width:520px;margin:0 auto">
      <a class="linkish" href="#/connexion" data-phase="roles">← ${esc(t("common.back"))}</a>
      <h1 style="margin-top:12px">${esc(t("role.patient"))}</h1>
      <p class="muted">${esc(t("login.patient.desc"))}</p>
      ${
        etat.erreur
          ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>`
          : `<div class="alert alert--info">${esc(t("login.demoNumber"))}</div>`
      }
      <form data-form="mobile" novalidate>
        <div class="field">
          <label for="mobile">${esc(t("login.mobile"))}</label>
          <input id="mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" value="${esc(etat.mobile)}" required aria-describedby="mobile-hint" />
          <span class="field__hint" id="mobile-hint">${esc(t("login.mobile.hint"))}</span>
        </div>
        <button class="btn btn--block" type="submit">${esc(t("login.sendCode"))}</button>
      </form>
      <p class="xs muted" style="margin-top:12px">${esc(t("demo.note"))}</p>
    </div>`;
}

function rendreCode() {
  const code = codeDemo();
  return `
    <div class="card" style="max-width:520px;margin:0 auto">
      <button class="linkish" type="button" data-phase="mobile" style="background:none;border:0;padding:0;cursor:pointer">← ${esc(
        t("login.changeNumber")
      )}</button>
      <h1 style="margin-top:12px">${esc(t("login.code"))}</h1>
      <p class="muted">${esc(t("login.mobile"))} : <strong dir="ltr">${esc(etat.mobile)}</strong></p>
      ${
        etat.erreur
          ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>`
          : ""
      }
      <form data-form="code" novalidate>
        <div class="field">
          <label for="otp">${esc(t("login.code"))}</label>
          <div class="otp-row">
            <input id="otp" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
              value="${esc(etat.code)}" required aria-describedby="otp-hint" />
            <button class="btn btn--secondary" type="submit">${esc(t("login.submit"))}</button>
          </div>
          <span class="field__hint" id="otp-hint">${esc(t("login.code.hint"))} — ${esc(t("login.sms.code"))}</span>
        </div>
      </form>
      ${
        code
          ? `<div class="alert alert--info">
               <div class="small">${esc(t("sms.demo.code"))}</div>
               <div class="row" style="margin-top:6px">
                 <span class="demo-code" dir="ltr">${esc(code)}</span>
                 <button class="btn btn--small btn--secondary" type="button" data-remplir="${esc(code)}">${esc(
                   t("login.submit")
                 )}</button>
               </div>
               <p class="xs" style="margin:8px 0 0">${esc(t("login.sms.code"))}</p>
             </div>`
          : ""
      }
    </div>`;
}

function rendreCreation() {
  return `
    <div class="card" style="max-width:520px;margin:0 auto">
      <h1>${esc(t("login.create.title"))}</h1>
      <p class="muted">${esc(t("login.create.desc", { mobile: etat.mobile }))}</p>
      ${etat.erreur ? `<div class="alert alert--error" role="alert">${esc(etat.erreur)}</div>` : ""}
      <form data-form="create" novalidate>
        <div class="field">
          <label for="prenom">${esc(t("login.firstName"))}</label>
          <input id="prenom" name="prenom" type="text" autocomplete="given-name" required value="${esc(etat.prenom)}" />
        </div>
        <div class="field">
          <label for="nom">${esc(t("login.lastName"))}</label>
          <input id="nom" name="nom" type="text" autocomplete="family-name" required value="${esc(etat.nom)}" />
        </div>
        <button class="btn btn--block" type="submit">${esc(t("login.create.submit"))}</button>
      </form>
    </div>`;
}

export default {
  rendre() {
    if (etat.phase === "mobile") return rendreMobile();
    if (etat.phase === "code") return rendreCode();
    if (etat.phase === "create") return rendreCreation();
    return rendreRoles();
  },

  monter({ root, rafraichir }) {
    root.querySelectorAll("[data-connect]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const role = btn.dataset.connect;
        try {
          if (role === "secretaire") seConnecterSecretaire(getLang());
          if (role === "dpo") seConnecterDpo();
          naviguer(role === "secretaire" ? "#/secretaire" : "#/donnees");
        } catch {
          toast(t("common.error"), "error");
        }
      });
    });

    root.querySelectorAll("[data-phase]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        etat.phase = btn.dataset.phase;
        etat.erreur = "";
        etat.code = "";
        rafraichir();
      });
    });

    const formMedecin = root.querySelector('form[data-form="medecin"]');
    formMedecin?.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        seConnecterMedecin(formMedecin.querySelector("select").value);
        naviguer("#/medecin");
      } catch {
        toast(t("common.error"), "error");
      }
    });

    const formMobile = root.querySelector('form[data-form="mobile"]');
    formMobile?.addEventListener("submit", (e) => {
      e.preventDefault();
      etat.mobile = normaliserMobile(formMobile.querySelector("#mobile").value);
      etat.erreur = "";
      if (!mobileValide(etat.mobile)) {
        etat.erreur = t("login.mobile.invalid");
        rafraichir();
        return;
      }
      try {
        demanderCode(etat.mobile, getLang());
        etat.phase = "code";
        rafraichir();
        root.querySelector("#otp")?.focus();
      } catch (err) {
        etat.erreur = messageErreur(err);
        rafraichir();
      }
    });

    const formCode = root.querySelector('form[data-form="code"]');
    formCode?.addEventListener("submit", (e) => {
      e.preventDefault();
      etat.code = formCode.querySelector("#otp").value.trim();
      etat.erreur = "";
      try {
        const res = verifierCode(etat.mobile, etat.code);
        if (res.nouveau) {
          etat.phase = "create";
          rafraichir();
          root.querySelector("#prenom")?.focus();
        } else {
          seConnecterPatient(res.patient);
          setLang(res.patient.langue || getLang());
          try {
            localStorage.setItem("jasmins.lang", res.patient.langue || "fr");
          } catch {
            /* ignore */
          }
          naviguer("#/patient");
        }
      } catch (err) {
        etat.erreur = messageErreur(err);
        etat.code = "";
        rafraichir();
      }
    });

    root.querySelectorAll("[data-remplir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const champ = root.querySelector("#otp");
        if (champ) {
          champ.value = btn.dataset.remplir;
          champ.focus();
        }
      });
    });

    const formCreate = root.querySelector('form[data-form="create"]');
    formCreate?.addEventListener("submit", (e) => {
      e.preventDefault();
      etat.prenom = formCreate.querySelector("#prenom").value.trim();
      etat.nom = formCreate.querySelector("#nom").value.trim();
      etat.erreur = "";
      if (!etat.prenom || !etat.nom) {
        etat.erreur = t("login.err.name");
        rafraichir();
        return;
      }
      try {
        creerComptePatient({ prenom: etat.prenom, nom: etat.nom, langue: getLang() });
        naviguer("#/patient");
      } catch {
        etat.erreur = t("common.error");
        rafraichir();
      }
    });
  },
};
