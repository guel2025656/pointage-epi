const express = require('express');
const QRCode = require('qrcode');
const prisma = require('../lib/prisma');
const { requireAdmin, scopeFilter } = require('../middleware/auth');

const router = express.Router();

// GET /api/qrcodes/site/:siteId.png — QR pointant vers l'appli avec le site pré-rempli
router.get('/site/:siteId.png', async (req, res) => {
  const site = await prisma.site.findUnique({ where: { id: req.params.siteId } });
  if (!site) return res.status(404).send('Site introuvable.');
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/?site=${site.id}`;
  const png = await QRCode.toBuffer(url, { width: 400, margin: 1 });
  res.setHeader('Content-Type', 'image/png');
  res.send(png);
});

// GET /api/qrcodes — liste des sites avec l'URL de leur QR (pour affichage groupé côté admin)
router.get('/', requireAdmin, async (req, res) => {
  const sites = await prisma.site.findMany({
    where: { secteur: { ...scopeFilter(req) } },
    include: { secteur: { select: { nom: true } } },
    orderBy: { nom: 'asc' },
  });
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  res.json(
    sites.map((s) => ({
      id: s.id,
      nom: s.nom,
      secteur: s.secteur.nom,
      qrUrl: `${baseUrl}/api/qrcodes/site/${s.id}.png`,
      pointageUrl: `${baseUrl}/?site=${s.id}`,
    }))
  );
});

module.exports = router;
