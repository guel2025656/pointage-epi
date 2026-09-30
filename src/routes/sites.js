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
  const { nom, secteurId } = req.body || {};
  if (!nom || !secteurId) return res.status(400).json({ error: 'nom et secteurId requis.' });
  try {
    const site = await prisma.site.create({ data: { nom, secteurId } });
    res.status(201).json(site);
  } catch (e) {
    res.status(409).json({ error: 'Ce site existe déjà dans ce secteur.' });
  }
});

module.exports = router;
