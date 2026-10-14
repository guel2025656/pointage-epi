const express = require('express');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const DEFAUT = { heureDebutCours: '07:30' };

async function lireParametres() {
  const lignes = await prisma.parametre.findMany();
  const p = { ...DEFAUT };
  lignes.forEach((l) => { p[l.cle] = l.valeur; });
  return p;
}

// Public : l'heure de début des cours sert aux rappels de pointage
router.get('/', async (req, res) => res.json(await lireParametres()));

router.patch('/', requireAdmin, async (req, res) => {
  const { heureDebutCours } = req.body || {};
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(heureDebutCours || ''))) {
    return res.status(400).json({ error: "Heure invalide (format HH:MM, ex. 07:30)." });
  }
  await prisma.parametre.upsert({
    where: { cle: 'heureDebutCours' },
    update: { valeur: heureDebutCours },
    create: { cle: 'heureDebutCours', valeur: heureDebutCours },
  });
  res.json(await lireParametres());
});

module.exports = router;
module.exports.lireParametres = lireParametres;
