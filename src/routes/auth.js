const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const router = express.Router();

// POST /api/auth/admin/login
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) return res.status(401).json({ error: 'Identifiants invalides.' });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides.' });

  const token = jwt.sign(
    { id: admin.id, nom: admin.nom, portee: admin.portee, secteurId: admin.secteurId },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, admin: { id: admin.id, nom: admin.nom, portee: admin.portee, secteurId: admin.secteurId } });
});

// POST /api/auth/acteur/verify-pin  — vérifie le PIN d'un acteur avant de le laisser pointer
router.post('/acteur/verify-pin', async (req, res) => {
  const { acteurId, pin } = req.body || {};
  if (!acteurId || !pin) return res.status(400).json({ error: 'acteurId et pin requis.' });
  const acteur = await prisma.acteur.findUnique({ where: { id: acteurId } });
  if (!acteur || !acteur.actif) return res.status(404).json({ error: 'Acteur introuvable.' });
  const ok = await bcrypt.compare(String(pin), acteur.pin);
  if (!ok) return res.status(401).json({ error: 'Code PIN incorrect.' });
  res.json({ ok: true });
});

module.exports = router;
