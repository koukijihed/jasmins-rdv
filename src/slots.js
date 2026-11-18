// Créneaux : grille déterministe de 20 minutes, dérivée de la date et du médecin.
// Aucune persistance : les créneaux sont recalculés et confrontés aux rendez-vous.

export const DUREE_MIN = 20;
export const HORIZON_JOURS = 14;

export const MATIN = { debut: 8 * 60 + 30, fin: 13 * 60 };
export const APRES_MIDI = { debut: 15 * 60, fin: 18 * 60 };

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function parseISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addDaysISO(iso, n) {
  return toISO(addDays(parseISODate(iso), n));
}

/** Dimanche fermé, samedi matin seulement. */
export function estJourOuvre(dateISO) {
  const jour = parseISODate(dateISO).getDay(); // 0 = dimanche
  return jour !== 0;
}

export function heureEnMinutes(heure) {
  const [h, m] = String(heure).split(":").map(Number);
  return h * 60 + m;
}

export function minutesEnHeure(min) {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

/** Liste des heures de début pour un jour donné. */
export function heuresDuJour(dateISO) {
  if (!estJourOuvre(dateISO)) return [];
  const jour = parseISODate(dateISO).getDay();
  const plages = jour === 6 ? [MATIN] : [MATIN, APRES_MIDI];
  const heures = [];
  for (const plage of plages) {
    for (let m = plage.debut; m + DUREE_MIN <= plage.fin; m += DUREE_MIN) {
      heures.push(minutesEnHeure(m));
    }
  }
  return heures;
}

export function creneauId(medecinId, date, heure) {
  return `${medecinId}|${date}|${heure}`;
}

export function parseCreneauId(id) {
  const [medecinId, date, heure] = String(id).split("|");
  if (!medecinId || !date || !heure) return null;
  return { medecinId, date, heure };
}

export function debutCreneau(date, heure) {
  return new Date(`${date}T${heure}:00`);
}

export function creneauDeId(id) {
  const parsed = parseCreneauId(id);
  if (!parsed) return null;
  const debut = debutCreneau(parsed.date, parsed.heure);
  return { ...parsed, id, debut };
}

/** Tous les créneaux d'un médecin entre deux dates (incluses). */
export function creneauxEntre(medecinId, dateDebutISO, jours = HORIZON_JOURS) {
  const resultat = [];
  for (let i = 0; i < jours; i += 1) {
    const date = addDaysISO(dateDebutISO, i);
    for (const heure of heuresDuJour(date)) {
      resultat.push({ id: creneauId(medecinId, date, heure), medecinId, date, heure, debut: debutCreneau(date, heure) });
    }
  }
  return resultat;
}

export function creneauxDuJour(medecinId, dateISO) {
  return heuresDuJour(dateISO).map((heure) => ({
    id: creneauId(medecinId, dateISO, heure),
    medecinId,
    date: dateISO,
    heure,
    debut: debutCreneau(dateISO, heure),
  }));
}

export function estDansLePasse(date, heure) {
  return debutCreneau(date, heure).getTime() <= Date.now();
}

export function heureLisible(heure) {
  return heure;
}

export function joursProchains(depuisISO = todayISO(), jours = HORIZON_JOURS) {
  const out = [];
  for (let i = 0; i < jours; i += 1) {
    const date = addDaysISO(depuisISO, i);
    if (estJourOuvre(date)) out.push(date);
  }
  return out;
}

export const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const JOURS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
