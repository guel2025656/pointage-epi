const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload; // { id, portee, secteurId }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}

// Ajoute un filtre Prisma "secteurId" si l'admin est cantonné à un secteur.
function scopeFilter(req) {
  if (req.admin && req.admin.portee === 'SECTEUR' && req.admin.secteurId) {
    return { secteurId: req.admin.secteurId };
  }
  return {};
}

module.exports = { requireAdmin, scopeFilter };
