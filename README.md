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

- `NATIONALE` (ex. DRENAET) : voit tous les secteurs.
- `SECTEUR` (ex. CPPP, IEPP) : ne voit que son secteur (`secteurId` sur
  le compte admin).

Créez les comptes superviseurs directement en base pour l'instant (pas
encore d'écran dédié) :

```bash
node -e "
const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('MOT_DE_PASSE', 10);
  await prisma.admin.create({ data: {
    nom: 'Nom du superviseur', email: 'email@example.com',
    passwordHash: hash, portee: 'SECTEUR', secteurId: 'ID_DU_SECTEUR'
  }});
  console.log('Compte créé');
})();
"
```

## 9. Prochaines étapes suggérées

- Écran d'administration pour créer les comptes superviseurs sans
  passer par la ligne de commande.
- Notifications (SMS/e-mail) sur les alertes d'absence répétée.
- Remontée vers un système DRENA/Ministère si ce besoin apparaît plus
  tard (actuellement : usage interne uniquement, comme demandé).
