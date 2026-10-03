const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const { secteurId } = req.query;
  const where = secteurId ? { secteurId } : {};
  const sites = await prisma.site.findMany({ where, include: { secteur: true }, orderBy: { nom: 'asc' } });
  res.json(sites);
});

router.post('/', requireAdmin, async (req, res) => {
  const { nom, secteurId, latitude, longitude } = req.body || {};
  if (!nom || !secteurId) return res.status(400).json({ error: 'nom et secteurId requis.' });
  try {
    const site = await prisma.site.create({
      data: { nom, secteurId, latitude: latitude ?? null, longitude: longitude ?? null },
    });
    res.status(201).json(site);
  } catch (e) {
    res.status(409).json({ error: 'Ce site existe déjà dans ce secteur.' });
  }
});

// PATCH /api/sites/:id/position — enregistre la position GPS de référence du site
// (à appeler en étant physiquement sur place, depuis l'onglet Administration).
router.patch('/:id/position', requireAdmin, async (req, res) => {
  const { latitude, longitude } = req.body || {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Coordonnées GPS invalides.' });
  }
  const site = await prisma.site.update({ where: { id: req.params.id }, data: { latitude, longitude } });
  res.json({ id: site.id, latitude: site.latitude, longitude: site.longitude });
});

module.exports = router;
