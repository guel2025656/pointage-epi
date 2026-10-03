const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function requireNationale(req, res, next) {
  if (!req.admin || req.admin.portee !== 'NATIONALE') {
    return res.status(403).json({ error: 'Seul un compte à portée nationale peut gérer les superviseurs.' });
  }
  next();
}

// GET /api/admins — liste des comptes superviseurs (national uniquement)
router.get('/', requireAdmin, requireNationale, async (req, res) => {
  const admins = await prisma.admin.findMany({
    select: { id: true, nom: true, email: true, portee: true, secteurId: true, secteur: { select: { nom: true } }, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(admins);
});

// POST /api/admins — créer un compte superviseur
router.post('/', requireAdmin, requireNationale, async (req, res) => {
  const { nom, email, password, portee, secteurId } = req.body || {};
  if (!nom || !email || !password || !portee) {
    return res.status(400).json({ error: 'nom, email, mot de passe et portée sont requis.' });
  }
  if (!['NATIONALE', 'SECTEUR'].includes(portee)) {
    return res.status(400).json({ error: 'Portée invalide.' });
  }
  if (portee === 'SECTEUR' && !secteurId) {
    return res.status(400).json({ error: 'Un secteur est requis pour une portée « secteur ».' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit comporter au moins 8 caractères.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const admin = await prisma.admin.create({
      data: { nom, email, passwordHash, portee, secteurId: portee === 'SECTEUR' ? secteurId : null },
    });
    res.status(201).json({ id: admin.id, nom: admin.nom, email: admin.email });
  } catch (e) {
    res.status(409).json({ error: 'Un compte existe déjà avec cet email.' });
  }
});

// PATCH /api/admins/:id — réinitialiser le mot de passe ou changer la portée
router.patch('/:id', requireAdmin, requireNationale, async (req, res) => {
  const { password, portee, secteurId } = req.body || {};
  const data = {};
  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit comporter au moins 8 caractères.' });
    data.passwordHash = await bcrypt.hash(password, 10);
  }
  if (portee) {
    if (!['NATIONALE', 'SECTEUR'].includes(portee)) return res.status(400).json({ error: 'Portée invalide.' });
    data.portee = portee;
    data.secteurId = portee === 'SECTEUR' ? (secteurId || null) : null;
  }
  const admin = await prisma.admin.update({ where: { id: req.params.id }, data });
  res.json({ id: admin.id });
});

// DELETE /api/admins/:id — révoquer un compte superviseur
router.delete('/:id', requireAdmin, requireNationale, async (req, res) => {
  if (req.params.id === req.admin.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  }
  await prisma.admin.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
