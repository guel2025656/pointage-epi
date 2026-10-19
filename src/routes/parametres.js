const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
// Horaires de l'EPI : matin 8h00–12h15, après-midi 14h30–17h30 (pas de cours le mercredi).
const DEFAUT = {
  heureDebutMatin: '08:00', heureFinMatin: '12:15',
  heureDebutApresMidi: '14:30', heureFinApresMidi: '17:30',
};
const CLES = Object.keys(DEFAUT);

async function lireParametres() {
  const lignes = await prisma.parametre.findMany();
  const p = { ...DEFAUT };
  lignes.forEach((l) => { p[l.cle] = l.valeur; });
  return p;
}

// Public : l'heure de début des cours sert aux rappels de pointage
router.get('/', async (req, res) => res.json(await lireParametres()));

router.patch('/', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const maj = CLES.filter((c) => body[c] !== undefined);
  if (!maj.length) return res.status(400).json({ error: 'Rien à modifier.' });
  for (const c of maj) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body[c]))) {
      return res.status(400).json({ error: 'Heure invalide (format HH:MM, ex. 08:00).' });
    }
  }
  for (const c of maj) {
    await prisma.parametre.upsert({
      where: { cle: c }, update: { valeur: body[c] }, create: { cle: c, valeur: body[c] },
    });
  }
  res.json(await lireParametres());
});

module.exports = router;
module.exports.lireParametres = lireParametres;
