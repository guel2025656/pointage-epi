const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

// POST /api/absences — l'acteur informe d'une autorisation d'absence déjà
// accordée par l'IEPP (en dehors de l'application), en précisant la période
// et les dispositions prises pour que les enfants ne perdent pas leur temps
// de travail. Pas de circuit de validation : c'est une simple information.
router.post('/', async (req, res) => {
  const { acteurId, dateDebut, dateFin, dispositions } = req.body || {};
  if (!acteurId || !dateDebut || !dispositions) {
    return res.status(400).json({ error: 'acteurId, dateDebut et dispositions sont requis.' });
  }
  const absence = await prisma.absence.create({
    data: {
      acteurId,
      dateDebut: new Date(dateDebut + 'T00:00:00.000Z'),
      dateFin: new Date((dateFin || dateDebut) + 'T00:00:00.000Z'),
      dispositions,
    },
  });
  res.status(201).json({ id: absence.id });
});

// GET /api/absences (admin) — journal des absences déclarées
router.get('/', requireAdmin, async (req, res) => {
  const absences = await prisma.absence.findMany({
    where: { acteur: { ...scopeFilter(req) } },
    include: { acteur: { select: { nom: true, role: true, site: { select: { nom: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(absences);
});

module.exports = router;
