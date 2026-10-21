const bcrypt = require('bcryptjs');
const prisma = require('./prisma');

// Au tout premier démarrage sur une base vide, crée le compte administrateur national
// à partir des variables d'environnement ADMIN_EMAIL et ADMIN_PASSWORD (et ADMIN_NOM, facultatif).
// Ne fait rien si un administrateur existe déjà : on peut donc laisser ces variables en place.
async function creerAdminInitial() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOM } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  if ((await prisma.admin.count()) > 0) return;
  if (String(ADMIN_PASSWORD).length < 8) {
    console.warn('ADMIN_PASSWORD trop court (8 caractères minimum) : administrateur non créé.');
    return;
  }
  await prisma.admin.create({
    data: {
      nom: ADMIN_NOM || 'Administrateur',
      email: ADMIN_EMAIL.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(String(ADMIN_PASSWORD), 10),
      portee: 'NATIONALE',
    },
  });
  console.log(`Compte administrateur créé : ${ADMIN_EMAIL}`);
}

module.exports = { creerAdminInitial };
