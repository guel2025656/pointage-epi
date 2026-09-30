const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public : nécessaire pour peupler les listes déroulantes de pointage
router.get('/', async (req, res) => {
  const secteurs = await prisma.secteur.findMany({ orderBy: { nom: 'asc' } });
  res.json(secteurs);
});

router.post('/', requireAdmin, async (req, res) => {
  const { nom } = req.body || {};
  if (!nom) return res.status(400).json({ error: 'Nom requis.' });
  try {
    const secteur = await prisma.secteur.create({ data: { nom } });
    res.status(201).json(secteur);
  } catch (e) {
    res.status(409).json({ error: 'Ce secteur existe déjà.' });
  }
});

module.exports = router;
