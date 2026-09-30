const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports/csv?secteurId=&siteId=&from=&to=
router.get('/csv', requireAdmin, async (req, res) => {
  const { secteurId, siteId, from, to } = req.query;
  const where = { acteur: { ...scopeFilter(req) } };
  if (secteurId) where.acteur.secteurId = secteurId;
  if (siteId) where.siteId = siteId;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from + 'T00:00:00.000Z');
    if (to) where.date.lte = new Date(to + 'T00:00:00.000Z');
  }
  const pointages = await prisma.pointage.findMany({
    where,
    include: { acteur: { select: { nom: true, role: true } }, site: { select: { nom: true } } },
    orderBy: { date: 'desc' },
  });

  const rows = [['Date', 'Acteur', 'Rôle', 'Site', 'Arrivée', 'Départ']];
  pointages.forEach((p) => {
    rows.push([
      p.date.toISOString().slice(0, 10),
      p.acteur.nom,
      p.acteur.role,
      p.site.nom,
      p.heureArrivee || '',
      p.heureDepart || '',
    ]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="pointages_epi.csv"');
  res.send(csv);
});

// GET /api/reports/alertes — acteurs sans pointage depuis N jours (défaut 7)
router.get('/alertes', requireAdmin, async (req, res) => {
  const jours = Number(req.query.jours || 7);
  const depuis = new Date();
  depuis.setDate(depuis.getDate() - jours);

  const acteurs = await prisma.acteur.findMany({
    where: { actif: true, ...scopeFilter(req) },
    include: { site: { select: { nom: true } }, pointages: { where: { date: { gte: depuis } } } },
  });

  const alertes = acteurs
    .map((a) => ({
      acteurId: a.id,
      nom: a.nom,
      role: a.role,
      site: a.site.nom,
      joursActifs: new Set(a.pointages.map((p) => p.date.toISOString().slice(0, 10))).size,
    }))
    .filter((a) => a.joursActifs <= 1)
    .sort((a, b) => a.joursActifs - b.joursActifs);

  res.json(alertes);
});

// GET /api/reports/taux-presence?date=YYYY-MM-DD (défaut aujourd'hui)
router.get('/taux-presence', requireAdmin, async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
  const date = new Date(dateStr + 'T00:00:00.000Z');

  const totalActeurs = await prisma.acteur.count({ where: { actif: true, ...scopeFilter(req) } });
  const presents = await prisma.pointage.count({
    where: { date, acteur: { ...scopeFilter(req) } },
  });

  res.json({
    date: dateStr,
    totalActeurs,
    presents,
    taux: totalActeurs ? Math.round((100 * presents) / totalActeurs) : 0,
  });
});

module.exports = router;
