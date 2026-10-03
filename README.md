# Pointage EPI

Application de pointage et de suivi de présence des acteurs de l'EPI
(enseignants itinérants, volontaires, CANEF, CPPP, IEPP).

Stack : Node.js / Express / Prisma / PostgreSQL, frontend en HTML/JS pur
(mobile-first), avec file d'attente hors-ligne côté navigateur.

## 1. Prérequis

- Node.js 18+
- Une base PostgreSQL accessible (locale, ou hébergée : Railway, Render,
  Neon, Supabase...)

## 2. Installation

```bash
npm install
cp .env.example .env
# Modifier .env : DATABASE_URL, JWT_SECRET, APP_URL
```

## 3. Base de données

```bash
npm run prisma:migrate:dev   # crée les tables (mode développement)
npm run seed                 # crée les secteurs/sites/acteurs de démonstration
                              # + un compte admin de démonstration
```

Identifiants créés par le seed :
- **Admin** : `admin@epi-meagui.ci` / `changer-ce-mot-de-passe` (portée nationale)
- **PIN de tous les acteurs de démonstration** : `0000`

**Changez ce mot de passe et ces PIN avant tout usage réel** (via
l'onglet Administration une fois connecté, ou directement en base).

## 4. Lancer l'application

```bash
npm run dev
```

Ouvrez `http://localhost:3000`.

## 5. Déploiement en production

- Déployez sur un service Node (Railway, Render, Fly.io, VPS...).
- Provisionnez une base PostgreSQL managée.
- Définissez les variables d'environnement (`DATABASE_URL`, `JWT_SECRET`,
  `APP_URL` = l'URL publique de l'appli, nécessaire pour que les QR codes
  pointent au bon endroit).
- Exécutez `npm run prisma:migrate` puis `npm run seed` (ou créez vos
  propres secteurs/sites/acteurs/admin via l'interface).
- npm run start pour démarrer le serveur.

Le frontend est servi directement par Express (`public/`) : une seule
URL pour tout le monde, mobile compris (il peut être « installé »
comme une application via le bouton d'installation du navigateur, grâce
au manifest PWA fourni).

## 6. Fonctionnement du pointage hors-ligne

Le navigateur tente d'enregistrer directement le pointage sur le
serveur. Si la connexion est absente, le pointage (acteur, date, heure,
géolocalisation et PIN) est mis en file d'attente dans le stockage local
du téléphone et renvoyé automatiquement dès que la connexion revient.

**Limite connue** : pour permettre cette re-synchronisation, le PIN est
brièvement conservé en clair dans le stockage local de l'appareil le
temps que la connexion revienne, puis effacé après envoi réussi. Sur un
téléphone partagé, préférez donc des sessions courtes et un PIN propre
à chaque acteur.

## 7. QR codes

Onglet *Administration → QR codes de pointage par site* : un QR par
site, généré côté serveur (`/api/qrcodes/site/:id.png`), à imprimer ou
afficher. Scanné avec l'appareil photo du téléphone, il ouvre
directement l'application avec le site pré-rempli.

## 8. Portée des comptes superviseurs

- `NATIONALE` (ex. DRENAET) : voit tous les secteurs, et peut créer/
  révoquer d'autres comptes superviseurs.
- `SECTEUR` (ex. CPPP, IEPP) : ne voit que son secteur (`secteurId` sur
  le compte admin).

Une fois connecté avec le compte admin de démonstration (portée
nationale), rendez-vous dans l'onglet **Administration → Comptes
superviseurs** pour créer les comptes CPPP/IEPP (nom, email, mot de
passe, portée, secteur si applicable), et pour les révoquer si besoin.
Cette section n'apparaît que pour les comptes à portée nationale.

## 9. Géolocalisation obligatoire sur site

Depuis l'onglet **Administration → QR codes**, le bouton « Définir la
position (être sur place) » enregistre la position GPS de référence
d'un site — à utiliser en étant physiquement sur place. Une fois cette
position définie :
- le QR code du site embarque ces coordonnées dans son lien ;
- tout pointage (arrivée ou départ) sur ce site est comparé à cette
  position, avec une tolérance de 150 mètres ; au-delà, le pointage
  est refusé avec un message explicite ;
- la géolocalisation devient obligatoire pour pointer sur ce site (un
  acteur qui refuse l'accès à sa position ne peut pas pointer).

Tant qu'un site n'a pas de position définie, le pointage y reste
accepté sans vérification (utile le temps de déployer progressivement
sur les 32 sites).

## 10. Absences : simple information, pas de validation

Le circuit d'absence a été simplifié : l'acteur informe l'application
d'une autorisation d'absence déjà accordée par l'IEPP en dehors de
l'application, en indiquant la période et les dispositions prises pour
que les enfants ne perdent pas leur temps de travail (remplacement,
rattrapage...). Il n'y a plus de bouton « Approuver/Refuser » : c'est
un journal d'information consultable par les superviseurs, pas un
circuit d'autorisation.

## 11. Logos et couleurs (UNICEF / Côte d'Ivoire)

L'interface utilise désormais le bleu UNICEF (#1CABE2) sur fond blanc.
Les emplacements des logos sont en place en haut de l'écran
(`public/index.html`, bloc `brand-header`), mais les fichiers actuels
dans `public/assets/unicef-logo.svg` et
`public/assets/armoiries-ci.svg` sont de simples **gabarits
temporaires** (un carré bleu et un carré blanc avec du texte) — Claude
n'a pas de droit à reproduire le logo officiel de l'UNICEF ni les
armoiries officielles de la Côte d'Ivoire. Remplacez ces deux fichiers
par les fichiers officiels (mêmes noms, ou ajustez le `src` dans
`index.html` si vous utilisez un autre format comme `.png`).

## 12. Prochaines étapes suggérées

- Notifications (SMS/e-mail) sur les alertes d'absence répétée.
- Remontée vers un système DRENA/Ministère si ce besoin apparaît plus
  tard (actuellement : usage interne uniquement, comme demandé).
