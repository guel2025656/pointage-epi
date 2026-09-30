const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

// POST /api/absences — un acteur (ou son secrétariat) dépose une demande
router.post('/', async (req, res) => {
  const { acteurId, dateDebut, dateFin, motif } = req.body || {};
  if (!acteurId || !dateDebut || !motif) {
    return res.status(400).json({ error: 'acteurId, dateDebut et motif sont requis.' });
  }
  const absence = await prisma.absence.create({
    data: {
      acteurId,
      dateDebut: new Date(dateDebut + 'T00:00:00.000Z'),
      dateFin: new Date((dateFin || dateDebut) + 'T00:00:00.000Z'),
      motif,
    },
  });
  res.status(201).json({ id: absence.id });
});

// GET /api/absences (admin)
router.get('/', requireAdmin, async (req, res) => {
  const absences = await prisma.absence.findMany({
    where: { acteur: { ...scopeFilter(req) } },
    include: { acteur: { select: { nom: true, role: true, site: { select: { nom: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(absences);
});

// PATCH /api/absences/:id (admin) — approuver/refuser
router.patch('/:id', requireAdmin, async (req, res) => {
  const { statut } = req.body || {};
  if (!['APPROUVEE', 'REFUSEE', 'EN_ATTENTE'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  const absence = await prisma.absence.update({ where: { id: req.params.id }, data: { statut } });
  res.json({ id: absence.id, statut: absence.statut });
});

module.exports = router;
