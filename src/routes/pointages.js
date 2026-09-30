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
  const acteur = await prisma.acteur.findUnique({ where: { id: acteurId } });
  if (!acteur || !acteur.actif) return null;
  const ok = await bcrypt.compare(String(pin), acteur.pin);
  return ok ? acteur : null;
}

// POST /api/pointages/arrivee
router.post('/arrivee', async (req, res) => {
  const { acteurId, pin, date, heure, lat, lng, creeHorsLigne } = req.body || {};
  if (!acteurId || !pin || !date || !heure) {
    return res.status(400).json({ error: 'acteurId, pin, date et heure sont requis.' });
  }
  const acteur = await checkPin(acteurId, pin);
  if (!acteur) return res.status(401).json({ error: 'Code PIN incorrect ou acteur inactif.' });

  const pointage = await prisma.pointage.upsert({
    where: { acteurId_date: { acteurId, date: todayUtcDate(date) } },
    update: { heureArrivee: heure, latArrivee: lat ?? null, lngArrivee: lng ?? null },
    create: {
      acteurId, siteId: acteur.siteId, date: todayUtcDate(date),
      heureArrivee: heure, latArrivee: lat ?? null, lngArrivee: lng ?? null,
      creeHorsLigne: !!creeHorsLigne,
    },
  });
  res.status(201).json({ id: pointage.id });
});

// POST /api/pointages/depart
router.post('/depart', async (req, res) => {
  const { acteurId, pin, date, heure, lat, lng, creeHorsLigne } = req.body || {};
  if (!acteurId || !pin || !date || !heure) {
    return res.status(400).json({ error: 'acteurId, pin, date et heure sont requis.' });
  }
  const acteur = await checkPin(acteurId, pin);
  if (!acteur) return res.status(401).json({ error: 'Code PIN incorrect ou acteur inactif.' });

  const pointage = await prisma.pointage.upsert({
    where: { acteurId_date: { acteurId, date: todayUtcDate(date) } },
    update: { heureDepart: heure, latDepart: lat ?? null, lngDepart: lng ?? null },
    create: {
      acteurId, siteId: acteur.siteId, date: todayUtcDate(date),
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
