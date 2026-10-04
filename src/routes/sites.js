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

// PATCH /api/sites/:id/position — enregistre la position GPS de référence du site.
// Utilisable soit en étant physiquement sur place (bouton géolocalisation),
// soit en saisissant directement des coordonnées déjà connues.
router.patch('/:id/position', requireAdmin, async (req, res) => {
  const { latitude, longitude } = req.body || {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Coordonnées GPS invalides.' });
  }
  const site = await prisma.site.update({ where: { id: req.params.id }, data: { latitude, longitude } });
  res.json({ id: site.id, latitude: site.latitude, longitude: site.longitude });
});

// PATCH /api/sites/:id — renomme le site et/ou le déplace vers un autre secteur
router.patch('/:id', requireAdmin, async (req, res) => {
  const { nom, secteurId } = req.body || {};
  const data = {};
  if (nom) data.nom = nom;
  if (secteurId) data.secteurId = secteurId;
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Rien à modifier.' });
  try {
    const site = await prisma.site.update({ where: { id: req.params.id }, data });
    res.json(site);
  } catch (e) {
    res.status(409).json({ error: 'Ce nom de site existe déjà dans ce secteur.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const nbActeurs = await prisma.acteur.count({ where: { siteId: req.params.id } });
  if (nbActeurs > 0) {
    return res.status(409).json({ error: `Impossible de supprimer : ${nbActeurs} acteur(s) sont encore rattachés à ce site.` });
  }
  await prisma.site.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
