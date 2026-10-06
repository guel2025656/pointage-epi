const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

function todayUtcDate(dateStr) {
  // dateStr attendu au format YYYY-MM-DD (date locale de l'acteur, envoyée par le client)
  return new Date(dateStr + 'T00:00:00.000Z');
}

async function checkPin(acteurId, pin) {
  const acteur = await prisma.acteur.findUnique({
    where: { id: acteurId },
    include: { sitesAffectes: { select: { id: true } } },
  });
  if (!acteur || !acteur.actif) return null;
  const ok = await bcrypt.compare(String(pin), acteur.pin);
  return ok ? acteur : null;
}

// Détermine le site effectif du pointage et vérifie qu'il est bien dans le
// périmètre de l'acteur, selon son rôle :
// VOLONTAIRE → son site fixe uniquement. ENSEIGNANT_ITINERANT → l'un de ses
// sites affectés (max 4). CPPP → n'importe quel site de son secteur.
// CANEF / IEPP → n'importe quel site, tous secteurs confondus.
async function resoudreSiteAutorise(acteur, siteIdDemande) {
  if (acteur.role === 'VOLONTAIRE') {
    if (!acteur.siteId) return { erreur: "Cet acteur n'a pas de site assigné." };
    return { siteId: acteur.siteId };
  }
  if (acteur.role === 'ENSEIGNANT_ITINERANT') {
    const autorises = acteur.sitesAffectes.map((s) => s.id);
    if (!siteIdDemande || !autorises.includes(siteIdDemande)) {
      return { erreur: "Veuillez choisir l'un de vos sites affectés." };
    }
    return { siteId: siteIdDemande };
  }
  if (!siteIdDemande) return { erreur: 'Veuillez choisir le site où vous pointez.' };
  if (acteur.role === 'CPPP') {
    const site = await prisma.site.findUnique({ where: { id: siteIdDemande } });
    if (!site || site.secteurId !== acteur.secteurId) {
      return { erreur: "Ce site n'appartient pas à votre secteur." };
    }
    return { siteId: siteIdDemande };
  }
  // CANEF / IEPP : tous les sites sont autorisés.
  return { siteId: siteIdDemande };
}

const RAYON_TOLERANCE_METRES = 150;

// Distance à vol d'oiseau entre deux points GPS (formule de Haversine), en mètres.
function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Vérifie que la position transmise est bien sur le site (si le site a une
// position de référence enregistrée). Retourne null si c'est bon, ou un
// message d'erreur sinon.
function verifierPresenceSurSite(site, lat, lng) {
  if (site.latitude == null || site.longitude == null) {
    return null; // site pas encore géolocalisé par un administrateur : pas de contrôle possible
  }
  if (lat == null || lng == null) {
    return "La géolocalisation est requise pour pointer sur ce site. Activez-la puis réessayez.";
  }
  const distance = distanceMetres(site.latitude, site.longitude, lat, lng);
  if (distance > RAYON_TOLERANCE_METRES) {
    return `Vous semblez trop loin du site (${Math.round(distance)} m) pour pointer. Rapprochez-vous puis réessayez.`;
  }
  return null;
}

// POST /api/pointages/arrivee
router.post('/arrivee', async (req, res) => {
  const { acteurId, pin, date, heure, lat, lng, siteId, creeHorsLigne } = req.body || {};
  if (!acteurId || !pin || !date || !heure) {
    return res.status(400).json({ error: 'acteurId, pin, date et heure sont requis.' });
  }
  const acteur = await checkPin(acteurId, pin);
  if (!acteur) return res.status(401).json({ error: 'Code PIN incorrect ou acteur inactif.' });

  const { siteId: siteEffectif, erreur: erreurSite } = await resoudreSiteAutorise(acteur, siteId);
  if (erreurSite) return res.status(403).json({ error: erreurSite });

  const site = await prisma.site.findUnique({ where: { id: siteEffectif } });
  const erreurPosition = verifierPresenceSurSite(site, lat ?? null, lng ?? null);
  if (erreurPosition) return res.status(403).json({ error: erreurPosition });

  const pointage = await prisma.pointage.upsert({
    where: { acteurId_date: { acteurId, date: todayUtcDate(date) } },
    update: { heureArrivee: heure, latArrivee: lat ?? null, lngArrivee: lng ?? null, siteId: siteEffectif },
    create: {
      acteurId, siteId: siteEffectif, date: todayUtcDate(date),
      heureArrivee: heure, latArrivee: lat ?? null, lngArrivee: lng ?? null,
      creeHorsLigne: !!creeHorsLigne,
    },
  });
  res.status(201).json({ id: pointage.id });
});

// POST /api/pointages/depart
router.post('/depart', async (req, res) => {
  const { acteurId, pin, date, heure, lat, lng, siteId, creeHorsLigne } = req.body || {};
  if (!acteurId || !pin || !date || !heure) {
    return res.status(400).json({ error: 'acteurId, pin, date et heure sont requis.' });
  }
  const acteur = await checkPin(acteurId, pin);
  if (!acteur) return res.status(401).json({ error: 'Code PIN incorrect ou acteur inactif.' });

  const { siteId: siteEffectif, erreur: erreurSite } = await resoudreSiteAutorise(acteur, siteId);
  if (erreurSite) return res.status(403).json({ error: erreurSite });

  const site = await prisma.site.findUnique({ where: { id: siteEffectif } });
  const erreurPosition = verifierPresenceSurSite(site, lat ?? null, lng ?? null);
  if (erreurPosition) return res.status(403).json({ error: erreurPosition });

  const pointage = await prisma.pointage.upsert({
    where: { acteurId_date: { acteurId, date: todayUtcDate(date) } },
    update: { heureDepart: heure, latDepart: lat ?? null, lngDepart: lng ?? null },
    create: {
      acteurId, siteId: siteEffectif, date: todayUtcDate(date),
      heureDepart: heure, latDepart: lat ?? null, lngDepart: lng ?? null,
      creeHorsLigne: !!creeHorsLigne,
    },
  });
  res.status(200).json({ id: pointage.id });
});

// GET /api/pointages?secteurId=&siteId=&from=&to=  (admin)
router.get('/', requireAdmin, async (req, res) => {
  const { secteurId, siteId, from, to } = req.query;
  const where = { acteur: { ...scopeFilter(req) } };
  if (secteurId) where.acteur.secteurId = secteurId;
  if (siteId) where.siteId = siteId;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = todayUtcDate(from);
    if (to) where.date.lte = todayUtcDate(to);
  }
  const pointages = await prisma.pointage.findMany({
    where,
    include: { acteur: { select: { nom: true, role: true } }, site: { select: { nom: true } } },
    orderBy: { date: 'desc' },
    take: 2000,
  });
  res.json(pointages);
});

// GET /api/pointages/mes-pointages?acteurId=  (public — l'acteur consulte son propre historique)
router.get('/mes-pointages', async (req, res) => {
  const { acteurId } = req.query;
  if (!acteurId) return res.status(400).json({ error: 'acteurId requis.' });
  const pointages = await prisma.pointage.findMany({
    where: { acteurId },
    orderBy: { date: 'desc' },
    take: 15,
  });
  res.json(pointages);
});

module.exports = router;
