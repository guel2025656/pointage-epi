const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

const ROLES_UN_SEUL_SITE = ['VOLONTAIRE'];
const ROLES_SITES_AFFECTES = ['ENSEIGNANT_ITINERANT'];
// CPPP, CANEF, IEPP : pas d'assignation de site (périmètre = secteur ou national, géré au pointage).

// Public (nécessaire pour la liste déroulante de pointage) — ne renvoie jamais le PIN
router.get('/', async (req, res) => {
  const { secteurId, siteId } = req.query;
  const where = {};
  if (secteurId) where.secteurId = secteurId;
  if (siteId) where.siteId = siteId;
  const acteurs = await prisma.acteur.findMany({
    where,
    select: { id: true, nom: true, role: true, actif: true, secteurId: true, siteId: true,
      site: { select: { nom: true } }, secteur: { select: { nom: true } },
      sitesAffectes: { select: { id: true, nom: true } } },
    orderBy: { nom: 'asc' },
  });
  res.json(acteurs);
});

router.post('/', requireAdmin, async (req, res) => {
  const { nom, role, pin, secteurId, siteId, sitesAffectesIds } = req.body || {};
  if (!nom || !role || !pin || !secteurId) {
    return res.status(400).json({ error: 'nom, role, pin et secteurId sont requis.' });
  }
  if (ROLES_UN_SEUL_SITE.includes(role) && !siteId) {
    return res.status(400).json({ error: 'Un site est requis pour ce rôle.' });
  }
  if (ROLES_SITES_AFFECTES.includes(role) && (!Array.isArray(sitesAffectesIds) || !sitesAffectesIds.length)) {
    return res.status(400).json({ error: 'Au moins un site affecté est requis pour ce rôle.' });
  }
  if (ROLES_SITES_AFFECTES.includes(role) && sitesAffectesIds.length > 4) {
    return res.status(400).json({ error: 'Un enseignant itinérant ne peut avoir plus de 4 sites affectés.' });
  }
  if (!/^\d{4}$/.test(String(pin))) {
    return res.status(400).json({ error: 'Le PIN doit comporter exactement 4 chiffres.' });
  }
  const pinHash = await bcrypt.hash(String(pin), 10);
  const data = { nom, role, pin: pinHash, secteurId };
  if (ROLES_UN_SEUL_SITE.includes(role)) data.siteId = siteId;
  if (ROLES_SITES_AFFECTES.includes(role)) data.sitesAffectes = { connect: sitesAffectesIds.map((id) => ({ id })) };
  const acteur = await prisma.acteur.create({ data });
  res.status(201).json({ id: acteur.id, nom: acteur.nom });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const { nom, role, siteId, secteurId, actif, pin, sitesAffectesIds } = req.body || {};
  const data = {};
  if (nom) data.nom = nom;
  if (role) data.role = role;
  if (siteId !== undefined) data.siteId = siteId || null;
  if (secteurId) data.secteurId = secteurId;
  if (typeof actif === 'boolean') data.actif = actif;
  if (Array.isArray(sitesAffectesIds)) {
    if (sitesAffectesIds.length > 4) return res.status(400).json({ error: 'Un enseignant itinérant ne peut avoir plus de 4 sites affectés.' });
    data.sitesAffectes = { set: sitesAffectesIds.map((id) => ({ id })) };
  }
  if (pin) {
    if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'Le PIN doit comporter 4 chiffres.' });
    data.pin = await bcrypt.hash(String(pin), 10);
  }
  const acteur = await prisma.acteur.update({ where: { id: req.params.id }, data });
  res.json({ id: acteur.id });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const [nbPointages, nbAbsences] = await Promise.all([
    prisma.pointage.count({ where: { acteurId: req.params.id } }),
    prisma.absence.count({ where: { acteurId: req.params.id } }),
  ]);
  if (nbPointages > 0 || nbAbsences > 0) {
    return res.status(409).json({
      error: "Cet acteur a déjà des pointages ou absences enregistrés : désactivez-le plutôt que de le supprimer, pour garder l'historique.",
    });
  }
  await prisma.acteur.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
