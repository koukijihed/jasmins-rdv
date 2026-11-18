// Navigation par hash, sans dépendance.

let rendu = null;

export function installerRouteur(fn) {
  rendu = fn;
  window.addEventListener("hashchange", () => rendu && rendu());
}

export function rerendre() {
  if (rendu) rendu();
}

export function naviguer(hash, { remplacer = false } = {}) {
  const cible = hash.startsWith("#") ? hash : `#${hash}`;
  if (location.hash === cible) {
    rerendre();
    return;
  }
  if (remplacer) {
    history.replaceState(null, "", cible);
    rerendre();
  } else {
    location.hash = cible;
  }
}

export function routeActuelle() {
  const brut = location.hash.replace(/^#\/?/, "");
  const [chemin, ...reste] = brut.split("/");
  return { chemin: chemin || "", segments: reste.map(decodeURIComponent) };
}
