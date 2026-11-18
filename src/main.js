// Point d'entrée : coquille de l'application, routes, session, temps réel.

import { initDb, getState, subscribe, traiterSmsDus, resetDemo, majPatient } from "./db.js";
import { t, setLang, getLang } from "./i18n.js";
import { session, deconnecter, CHEMIN_PAR_ROLE } from "./auth.js";
import { installerRouteur, routeActuelle, naviguer, rerendre } from "./router.js";
import { esc } from "./ui.js";

import loginPage, { reinitialiserLogin } from "./pages/login.js";
import patientPage from "./pages/patient.js";
import secretaryPage from "./pages/secretary.js";
import doctorPage from "./pages/doctor.js";
import dpoPage from "./pages/dpo.js";
import smsPage from "./pages/sms.js";
import cancelPage from "./pages/cancel.js";

const PAGES = {
  connexion: loginPage,
  patient: patientPage,
  secretaire: secretaryPage,
  medecin: doctorPage,
  donnees: dpoPage,
  sms: smsPage,
  annuler: cancelPage,
};

const ROLE_REQUIS = {
  patient: "patient",
  secretaire: "secretaire",
  medecin: "medecin",
  donnees: "dpo",
};

// Clés i18n des rôles : les identifiants internes diffèrent des clés anglaises.
const CLE_ROLE = { patient: "patient", secretaire: "secretary", medecin: "doctor", dpo: "dpo" };

const TITRES = {
  patient: "nav.patient",
  secretaire: "nav.secretary",
  medecin: "nav.doctor",
  donnees: "nav.dpo",
  sms: "sms.title",
  annuler: "cl.title",
  connexion: "nav.login",
};

const app = document.getElementById("app");
let sale = false;
let dernierChemin = null;

/* ------------------------------------------------------------------ */
/* Coquille                                                            */

function liensNavigation(s, chemin) {
  const liens = [];
  if (!s) return liens;
  if (s.role === "patient") {
    liens.push({ href: "#/patient", label: t("nav.patient"), actif: chemin === "patient" });
    liens.push({ href: "#/patient/rdv", label: t("p.myAppts"), actif: location.hash.includes("/patient/rdv") });
    liens.push({ href: "#/patient/compte", label: t("p.account"), actif: location.hash.includes("/patient/compte") });
  }
  if (s.role === "secretaire") {
    liens.push({ href: "#/secretaire", label: t("nav.secretary"), actif: chemin === "secretaire" && !location.hash.includes("/nouveau") });
    liens.push({ href: "#/secretaire/nouveau", label: t("s.new.short"), actif: location.hash.includes("/nouveau") });
  }
  if (s.role === "medecin") liens.push({ href: "#/medecin", label: t("nav.doctor"), actif: chemin === "medecin" });
  if (s.role === "dpo") liens.push({ href: "#/donnees", label: t("nav.dpo"), actif: chemin === "donnees" });
  return liens;
}

function entete(s, chemin) {
  const liens = liensNavigation(s, chemin);
  const retour = s ? CHEMIN_PAR_ROLE[s.role] : "#/connexion";
  return `
    <header class="app-header">
      <div class="app-header__inner">
        <a class="brand" href="${retour}">
          <span class="brand__logo">Polyclinique Les Jasmins</span>
          <span class="brand__city">${esc(t("brand.city"))}</span>
        </a>
        ${s ? `<span class="badge badge--reserve">${esc(t(`role.${CLE_ROLE[s.role] || s.role}`))}${s.role === "patient" ? "" : ` · ${esc(s.nom)}`}</span>` : ""}
        <div class="lang-switch" role="group" aria-label="${esc(t("lang.label"))}">
          <button type="button" data-lang="fr" aria-pressed="${getLang() === "fr"}">FR</button>
          <button type="button" data-lang="ar" aria-pressed="${getLang() === "ar"}">عربية</button>
        </div>
        <a class="nav-sms small" href="#/sms" aria-label="${esc(t("nav.sms"))}" ${chemin === "sms" ? 'aria-current="page"' : ""}>
          ${esc(t("nav.sms"))}
        </a>
        ${
          s
            ? `<button class="btn btn--small btn--secondary" type="button" data-deconnexion>${esc(t("nav.logout"))}</button>`
            : `<a class="btn btn--small" href="#/connexion">${esc(t("nav.login"))}</a>`
        }
      </div>
      ${
        liens.length
          ? `<nav class="app-nav" aria-label="${esc(t("nav.main"))}" style="max-width:1080px;margin:0 auto;padding:0 16px 8px">
               ${liens
                 .map(
                   (l) =>
                     `<a href="${l.href}" ${l.actif ? 'aria-current="page"' : ""}>${esc(l.label)}</a>`
                 )
                 .join("")}
             </nav>`
          : ""
      }
    </header>`;
}

function piedDePage() {
  return `
    <footer style="max-width:1080px;margin:0 auto;padding:0 16px 28px">
      <p class="xs muted" style="margin-bottom:6px">${esc(t("demo.note"))}</p>
      <button class="linkish xs" type="button" data-reset-demo>${esc(t("demo.reset"))}</button>
    </footer>`;
}

function pageErreur(message) {
  return `
    <div class="card" style="max-width:560px;margin:40px auto;text-align:center">
      <h1>${esc(t("e.title"))}</h1>
      <p class="muted">${esc(message)}</p>
      <a class="btn" href="#/connexion">${esc(t("cl.login"))}</a>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */

function rendre() {
  const route = routeActuelle();
  let chemin = route.chemin;
  const s = session();

  if (!chemin) {
    naviguer(s ? CHEMIN_PAR_ROLE[s.role] : "#/connexion", { remplacer: true });
    return;
  }

  if (chemin === "connexion" && s) {
    naviguer(CHEMIN_PAR_ROLE[s.role], { remplacer: true });
    return;
  }

  if (ROLE_REQUIS[chemin] && !s) {
    naviguer("#/connexion", { remplacer: true });
    return;
  }

  if (chemin === "connexion" && dernierChemin && dernierChemin !== "connexion") {
    reinitialiserLogin();
  }

  const page = PAGES[chemin];
  if (!page) {
    app.innerHTML = entete(s, chemin) + `<main id="contenu">${pageErreur(t("e.notFound"))}</main>`;
    return;
  }

  if (ROLE_REQUIS[chemin] && s.role !== ROLE_REQUIS[chemin]) {
    app.innerHTML =
      entete(s, chemin) +
      `<main id="contenu">${pageErreur(t("e.forbidden"))}${retourRole(s)}</main>` +
      piedDePage();
    return;
  }

  let html = "";
  try {
    html = page.rendre({ route, session: s });
  } catch (err) {
    console.error(err);
    html = `<div class="alert alert--error">${esc(t("common.error"))}</div>`;
  }

  app.innerHTML = entete(s, chemin) + `<main id="contenu">${html}</main>` + piedDePage();
  document.title = `${t("brand.name")} — ${t(TITRES[chemin] || "nav.home")}`;
  document.getElementById("skip").textContent = t("nav.skip");

  // Navigation interne de la coquille.
  app.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => changerLangue(btn.dataset.lang));
  });
  app.querySelector("[data-deconnexion]")?.addEventListener("click", () => {
    deconnecter();
    reinitialiserLogin();
    dernierChemin = null;
    naviguer("#/connexion", { remplacer: true });
  });
  app.querySelector("[data-reset-demo]")?.addEventListener("click", () => {
    if (window.confirm(t("demo.reset.confirm"))) {
      resetDemo();
      deconnecter();
      reinitialiserLogin();
      navScroller();
      naviguer("#/connexion", { remplacer: true });
    }
  });

  try {
    page.monter({ root: document.getElementById("contenu"), route, session: s, rafraichir: rerendre });
  } catch (err) {
    console.error(err);
  }

  if (dernierChemin !== chemin) {
    dernierChemin = chemin;
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function retourRole(s) {
  return `<p style="margin-top:12px"><a class="btn btn--secondary" href="${CHEMIN_PAR_ROLE[s.role]}">${esc(
    t("nav.home")
  )}</a></p>`;
}

function changerLangue(lang) {
  const s = session();
  setLang(lang);
  try {
    localStorage.setItem("jasmins.lang", lang);
  } catch {
    /* ignore */
  }
  if (s?.role === "patient" && s.patientId) {
    try {
      majPatient(s.patientId, { langue: lang }, { nom: s.nom, role: "patient" });
    } catch {
      /* ignore */
    }
  }
  rerendre();
}

function navScroller() {
  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */

initDb();

let langueInitiale = "fr";
try {
  langueInitiale = localStorage.getItem("jasmins.lang") || "fr";
} catch {
  langueInitiale = "fr";
}
const s0 = session();
if (s0?.role === "patient") {
  const p = getState().patients.find((x) => x.id === s0.patientId);
  if (p?.langue) langueInitiale = p.langue;
}
setLang(langueInitiale);

subscribe(() => {
  sale = true;
});

installerRouteur(rendre);
rendre();
traiterSmsDus();

setInterval(() => {
  traiterSmsDus();
  const chemin = routeActuelle().chemin;
  const estLive = ["patient", "secretaire", "medecin", "donnees", "sms"].includes(chemin);
  const actif = document.activeElement;
  const champ = actif && ["INPUT", "TEXTAREA", "SELECT"].includes(actif.tagName);
  if (sale && estLive && !champ && document.visibilityState === "visible") {
    sale = false;
    rerendre();
  }
}, 5000);
