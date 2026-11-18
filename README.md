# Polyclinique Les Jasmins — Prise de rendez-vous en ligne (R1)

Prototype MVP de la plateforme de rendez-vous de la **Polyclinique Les Jasmins (Sfax, Tunisie)**.
Application web statique, bilingue **français / arabe**, quatre espaces (patient, secrétariat, médecin,
responsable des données), données de démonstration et simulation complète des SMS.

Aucune dépendance, aucune compilation : HTML + modules ES natifs.

**Démo en ligne : https://koukijihed.github.io/jasmins-rdv/** — **Dépôt : https://github.com/koukijihed/jasmins-rdv**

---

## Démarrage

```bash
npm start
```

Puis ouvrir **http://localhost:4173**.

Autre port : `PORT=5000 npm start` (PowerShell : `$env:PORT=5000; npm start`).

> Le serveur `server.js` ne sert que des fichiers statiques (avec repli SPA). Aucune donnée n'est
> envoyée sur le réseau : tout l'état vit dans le `localStorage` du navigateur.

### Réinitialiser la démonstration

- Bouton **« Réinitialiser la démo »** en bas de chaque écran.
- Les données sont aussi régénérées automatiquement au changement de jour (`seedDate`).
- En cas de doute : vider le stockage du site (`localStorage` + `sessionStorage`) et recharger.

---

## Comptes de démonstration

La page de connexion présente les quatre espaces avec des comptes préremplis : **un clic suffit**.

| Espace | Accès | Compte |
| --- | --- | --- |
| Patient | mobile + code SMS à 6 chiffres | **+216 20 123 456** — Amine Ben Salah (FR) |
| Patient (sans consentement) | mobile + code SMS | **+216 29 667 788** — Asma Tounsi |
| Accueil / secrétariat | un clic | Salma Trabelsi |
| Médecin | un clic | 6 médecins (Dr Ines Gharbi par défaut) |
| Responsable des données | un clic | Nizar Kallel |

- Le **code de connexion** est affiché directement sur l'écran de saisie **et** dans le
  **Journal SMS** (`#/sms`), comme demandé pour la démo.
- Tout autre numéro au format `+216` + 8 chiffres crée un nouveau compte patient (avec consentement
  à donner à la première réservation).
- Le sélecteur **FR / عربية** est présent sur tous les écrans ; le choix est mémorisé et devient la
  langue de référence du patient connecté (donc celle de ses SMS).

---

## Architecture

```
index.html            coquille HTML (police IBM Plex Sans Arabic, styles, point d'entrée)
server.js             serveur statique Node sans dépendance (port 4173)
src/
  main.js             coquille, en-tête/pied de page, gardes de rôle, polling 5 s
  router.js           navigation par hash (naviguer, rerendre, routeActuelle)
  db.js               magasin localStorage, règles métier, disponibilités, moteur SMS
  seed.js             jeu de données de démonstration (30 patients, 6 médecins, 26 RDV)
  slots.js            grille de créneaux de 20 min (8 h 30–13 h, 15 h–18 h)
  auth.js             OTP simulé, sessions, blocage après 3 essais
  sms-text.js         modèles SMS FR/AR, limites 306/134, calcul des rappels
  i18n.js             dictionnaire FR/AR (~320 clés), dates localisées, formats
  ui.js               helpers d'affichage (noms, spécialités, étages, motifs, CSV)
  search.js           recherche tolérante (Levenshtein + normalisation phonétique)
  pages/              login, patient, secretary, doctor, dpo, sms, cancel (lien SMS)
  styles.css          design system (blanc, accent bleu-vert, coins 8 px, mobile d'abord)
```

### Modèle de données (localStorage, clé `jasmins.rdv.v1`)

`patients`, `medecins`, `specialites`, `rendezVous`, `indisponibilites`, `consentements`, `sms`,
`journal`, `holds`, `consentementsTextes`, `seq`.

Les **créneaux ne sont pas stockés** : ils sont dérivés de la grille (médecin × date × heure) et de
l'état des rendez-vous. Un créneau est identifié par `medecinId|YYYY-MM-DD|HH:MM`.

---

## Règles métier et interprétations

| Sujet | Choix implémenté |
| --- | --- |
| Créneaux | 20 min ; 08:30–13:00 et 15:00–18:00 (derniers créneaux 12:30 et 17:40) ; lundi–vendredi les deux plages, **samedi matin uniquement**, dimanche fermé ; 14 jours glissants. |
| Réservation | 3 étapes : créneau → motif → confirmation (avec consentement). |
| Unicité | Vérifiée **de façon synchrone** dans `creerRdv` : un seul rendez-vous actif par créneau, y compris en cas de clics simultanés. |
| Blocage de saisie | Le créneau est réservé 10 min à l'ouverture de l'étape « motif » (`holds`) ; les autres patients voient « créneau en cours de réservation ». Le blocage est libéré à la confirmation ou à l'abandon. |
| Annulation | Possible jusqu'à **4 h avant** ; depuis l'espace patient ou depuis le lien du SMS (`#/annuler/<token>`) ; créneau libéré immédiatement ; SMS d'accusé. |
| Déplacement | L'ancien créneau n'est libéré qu'après confirmation du nouveau ; l'ancien rendez-vous passe au statut `deplace` et un nouveau lui est lié (`groupe`) ; **2 déplacements maximum**. |
| Rappels | Veille à **18 h** et **3 h avant** ; jamais hors de la plage **9 h–20 h** ; aucun rappel pour un rendez-vous annulé ou déplacé ; langue du patient. |
| SMS | Aucun envoi réel. Limite **2 segments** : 306 caractères en latin, 134 en arabe. Types : confirmation, rappel veille, rappel 3 h, annulation, absence médecin, code de connexion. |
| Consentement | Case **non précochée**, texte FR **et** AR, enregistré avec version (`v1.0`), date et langue, uniquement pour les réservations web. Les patients créés par le secrétariat n'ont pas de compte en ligne. |
| Temps réel | Rafraîchissement automatique **toutes les 5 s** (sans rechargement), en pause pendant la saisie d'un champ. |
| No-show | `absents / (présent + en retard + absent)` sur les rendez-vous passés ; les annulés et déplacés sont exclus. |
| Absences médecin | Blocage ponctuel ou hebdomadaire (date de fin), journée entière ou demi-journée ; les rendez-vous impactés sont annulés et les patients prévenus par SMS avec un lien pour reprendre un créneau. |
| Cloisonnement | Chaque page vérifie le rôle ; chaque consultation d'un dossier patient écrit une ligne dans le journal des accès. |
| Export CSV | Journal des accès : UTF-8 avec BOM, séparateur `;`, fins de ligne CRLF (ouverture directe dans Excel FR). |

### Hypothèses signalées (ambiguïtés du brief)

1. **« Une vingtaine de rendez-vous »** : le jeu contient 26 rendez-vous au total (historique,
   annulé, à venir et journée du jour), dont **4 absents sur 14 rendez-vous passés → 29 %** de
   no-show, au-dessus de l'objectif de 15 % pour rendre l'indicateur parlant.
2. **« 2 SMS au plus »** est interprété comme **2 segments GSM maximum** par message (306 / 134
   caractères), et non comme deux messages par rendez-vous : confirmation + rappels restent séparés.
3. **Samedi** : seul le créneau du matin est ouvert ; **dimanche** est fermé (choix le plus simple
   compatible avec « du lundi au samedi matin »).
4. **Lien d'annulation** : le SMS contient un lien court fictif `jasmins.tn/a/<token>`. Dans le
   prototype, il est utilisable depuis l'écran de confirmation (« lien reçu dans le SMS ») et ouvre
   la page d'annulation réelle.
5. **Langue du patient** : la langue choisie dans l'interface au moment de la connexion devient sa
   langue de référence ; une correction explicite dans « Mon compte » la modifie durablement.
6. **Absence médecin** : le brief demande de prévenir les patients ; le prototype annule le
   rendez-vous (statut `annule`) et envoie un SMS d'invitation à choisir un autre créneau.
7. **Hors périmètre R2** : aucun développement (compte aidant, liste d'attente, retour SMS,
   éditeur de modèles, durée par motif, tableau de bord direction, paiement).

---

## Tableau de recette

Statuts : **fait** = vérifié à la main dans le prototype ; partiel / non fait = raison indiquée.

| ID | Écran concerné | Critères vérifiés | Statut |
| --- | --- | --- | --- |
| **E1.1** | Connexion → Patient (mobile, code) | Format `+216` + 8 chiffres validé ; code 6 chiffres valable 5 min ; 3 essais puis blocage 15 min ; ni mot de passe ni e-mail ; code visible dans le Journal SMS. | fait |
| **E1.2** | Tous les écrans (sélecteur FR/AR) | Sélecteur visible partout ; choix mémorisé après rechargement ; `dir="rtl"` et `lang="ar"` en arabe ; dates/heures localisées ; SMS dans la langue du patient ; police IBM Plex Sans Arabic. | fait |
| **E2.1** | Patient → Rechercher un créneau | 3 filtres combinables (spécialité, médecin, date de début) ; résultats sur 14 jours ; message explicite « aucun créneau disponible ». | fait |
| **E2.2** | Patient → Créneau → Motif → Confirmation | 3 étapes avec indicateur de progression ; créneau bloqué 10 min ; créneau déjà pris refusé (`creneau_pris`) ; créneau en cours de réservation refusé (`creneau_en_cours`) ; unicité contrôlée à l'écriture. | fait |
| **E2.3** | Confirmation + Journal SMS | SMS de confirmation avec date, heure, médecin, étage, carte Labès (CNAM), pièce d'identité et lien d'annulation ; ≤ 306 caractères latin / 134 arabe (2 segments). | fait |
| **E3.1** | Patient → Mes rendez-vous / page d'annulation SMS | Annulation jusqu'à 4 h avant ; refus au-delà (`trop_tard`) ; depuis l'app et depuis le lien token ; créneau libéré immédiatement ; SMS d'accusé. | fait |
| **E3.2** | Patient → Mes rendez-vous → Déplacer | Ancien créneau libéré seulement après confirmation ; statut `deplace` + nouveau rendez-vous lié ; 2 déplacements maximum (`limite_deplacements`). | fait |
| **E4.1** | Journal SMS / moteur de rappels | Rappel veille à 18 h et 3 h avant ; envois planifiés entre 9 h et 20 h ; aucun rappel si annulé/déplacé ; langue du patient ; rappels en retard envoyés au chargement. | fait |
| **E5.1** | Médecin → Mon planning | Planning du jour chronologique ; mise à jour sans rechargement (polling 5 s, vérifié : 1 → 2 rendez-vous) ; statuts présent / en retard / absent colorés. | fait |
| **E5.2** | Médecin → Bloquer une absence | Blocage ponctuel ou hebdomadaire (date de fin), journée ou demi-journée ; rendez-vous impactés annulés ; SMS d'absence avec lien de reprise ; rendez-vous déjà honorés non modifiés. | fait |
| **E6.1** | Secrétariat → Nouveau RDV | Saisie téléphone/guichet en moins de 45 s ; patient créé sans compte en ligne ; même contrôle anti-doublon que le web ; confirmation + rappel générés. | fait |
| **E6.2** | Secrétariat → Agenda du jour | Pointage présent / en retard / absent en 1 clic ; l'absent non excusé entre dans le taux de no-show affiché (vérifié : 4/14 → 5/14). | fait |
| **E6.3** | Secrétariat → Recherche patient | Recherche par nom ou numéro, tolérante aux fautes et translittérations (`Med`, `Mohamed`, `Mohammed`, `Nourh`, `20123456`) ; saisie aberrante sans résultat. | fait |
| **E7.1** | Patient → Confirmation (consentement) | Case non précochée ; texte complet en FR et AR ; consentement daté, versionné (`v1.0`) et associé à la langue ; réservation bloquée sans la case. | fait |
| **E7.2** | Responsable des données → Journal des accès | Journal horodaté (qui, quoi, patient, quand), lecture seule, filtres (rôle, action, période), export CSV UTF-8/BOM/`;`/CRLF. | fait |
| **E7.3** | Patient → Mon compte | Un seul écran pour toutes les données ; correction enregistrée ; chaque correction tracée dans le journal avec l'ancienne et la nouvelle valeur. | fait |

### Definition of Done commune

- Mobile d'abord : aucun débordement horizontal à **360 px** (vérifié sur les 10 écrans, en FR et AR).
- Bilingue complet, messages d'erreur compris ; RTL intégral en arabe.
- Aucune dépendance réseau hors police (facultative) ; pages légères.
- Contrastes AA, cibles ≥ 44 px, chaque champ libellé.
- Accès aux dossiers limité par rôle et tracé dans le journal.
- Aucun texte factice.

---

## Vérifications rapides

1. **Connexion** : un clic sur « Patient », « Accueil et secrétariat », un médecin ou « Responsable des données ».
2. **Réservation** : Patient → Rechercher → choisir un créneau → motif → consentement → confirmer ; le SMS apparaît sur l'écran et dans le Journal SMS.
3. **Temps réel** : ouvrir le planning du médecin dans un second onglet, réserver depuis le premier : la ligne apparaît en ~5 s.
4. **Annulation** : Mes rendez-vous → Annuler (possible seulement à plus de 4 h) ; vérifier le SMS d'accusé et le créneau redevenu disponible.
5. **Déplacement** : Mes rendez-vous → Déplacer → nouveau créneau ; l'ancien rendez-vous passe en `deplace`, le compteur augmente (max 2).
6. **Absence** : Médecin → Bloquer une absence → constater l'annulation et le SMS dans le Journal SMS.
7. **Conformité** : Responsable des données → filtrer puis exporter le CSV ; Patient → Mon compte → corriger une donnée et vérifier la ligne de journal.
