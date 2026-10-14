const express = require('express');
const prisma = require('../lib/prisma');
const { lireParametres } = require('./parametres');

const router = express.Router();

// GET /api/offline/bundle
// Paquet complet (secteurs, sites avec position, acteurs avec leur PIN haché)
// téléchargé une fois sur l'appareil pour permettre le pointage sans réseau.
// Le PIN haché (bcrypt) est inclus volontairement : il permet une vérification
// locale identique à la vérification serveur, sans jamais exposer le PIN en clair.
router.get('/bundle', async (req, res) => {
  const [secteurs, sites, acteurs, inspections, parametres] = await Promise.all([
    prisma.secteur.findMany({ select: { id: true, nom: true, inspectionId: true } }),
    prisma.site.findMany({
      select: { id: true, nom: true, secteurId: true, latitude: true, longitude: true },
    }),
    prisma.acteur.findMany({
      where: { actif: true },
      select: {
        id: true, nom: true, role: true, secteurId: true, siteId: true, inspectionId: true, pin: true,
        sitesAffectes: { select: { id: true } },
      },
    }),
    prisma.inspection.findMany({ select: { id: true, nom: true } }),
    lireParametres(),
  ]);
  res.json({
    genereLe: new Date().toISOString(),
    secteurs,
    inspections,
    parametres,
    sites,
    acteurs: acteurs.map((a) => ({
      id: a.id, nom: a.nom, role: a.role, secteurId: a.secteurId, siteId: a.siteId, inspectionId: a.inspectionId,
      sitesAffectesIds: a.sitesAffectes.map((s) => s.id),
      pinHash: a.pin,
    })),
  });
});

module.exports = router;
