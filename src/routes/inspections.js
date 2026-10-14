const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Public : nécessaire pour l'écran de pointage (périmètre des IEPP / CANEF)
router.get('/', async (req, res) => {
  res.json(await prisma.inspection.findMany({ orderBy: { nom: 'asc' } }));
});

router.post('/', requireAdmin, async (req, res) => {
  const { nom } = req.body || {};
  if (!nom) return res.status(400).json({ error: 'Nom requis.' });
  try {
    res.status(201).json(await prisma.inspection.create({ data: { nom } }));
  } catch (e) {
    res.status(409).json({ error: 'Cette inspection existe déjà.' });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const { nom } = req.body || {};
  if (!nom) return res.status(400).json({ error: 'Nom requis.' });
  try {
    res.json(await prisma.inspection.update({ where: { id: req.params.id }, data: { nom } }));
  } catch (e) {
    res.status(409).json({ error: 'Ce nom existe déjà.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const [nbSecteurs, nbActeurs] = await Promise.all([
    prisma.secteur.count({ where: { inspectionId: req.params.id } }),
    prisma.acteur.count({ where: { inspectionId: req.params.id } }),
  ]);
  if (nbSecteurs || nbActeurs) {
    return res.status(409).json({ error: `Impossible de supprimer : ${nbSecteurs} secteur(s) et ${nbActeurs} acteur(s) y sont rattachés.` });
  }
  await prisma.inspection.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
