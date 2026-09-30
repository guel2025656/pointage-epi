const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

// Public (nécessaire pour la liste déroulante de pointage) — ne renvoie jamais le PIN
router.get('/', async (req, res) => {
  const { secteurId, siteId } = req.query;
  const where = {};
  if (secteurId) where.secteurId = secteurId;
  if (siteId) where.siteId = siteId;
  const acteurs = await prisma.acteur.findMany({
    where,
    select: { id: true, nom: true, role: true, actif: true, secteurId: true, siteId: true,
      site: { select: { nom: true } }, secteur: { select: { nom: true } } },
    orderBy: { nom: 'asc' },
  });
  res.json(acteurs);
});

router.post('/', requireAdmin, async (req, res) => {
  const { nom, role, pin, secteurId, siteId } = req.body || {};
  if (!nom || !role || !pin || !secteurId || !siteId) {
    return res.status(400).json({ error: 'nom, role, pin, secteurId et siteId sont requis.' });
  }
  if (!/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'Le PIN doit comporter exactement 4 chiffres.' });
  }
  const pinHash = await bcrypt.hash(String(pin), 10);
  const acteur = await prisma.acteur.create({
    data: { nom, role, pin: pinHash, secteurId, siteId },
  });
  res.status(201).json({ id: acteur.id, nom: acteur.nom });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const { nom, role, siteId, secteurId, actif, pin } = req.body || {};
  const data = {};
  if (nom) data.nom = nom;
  if (role) data.role = role;
  if (siteId) data.siteId = siteId;
  if (secteurId) data.secteurId = secteurId;
  if (typeof actif === 'boolean') data.actif = actif;
  if (pin) {
    if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'Le PIN doit comporter 4 chiffres.' });
    data.pin = await bcrypt.hash(String(pin), 10);
  }
  const acteur = await prisma.acteur.update({ where: { id: req.params.id }, data });
  res.json({ id: acteur.id });
});

module.exports = router;
