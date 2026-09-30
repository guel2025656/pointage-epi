const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEMO_SITES = {
  Dahili: ['Alphonsekro', "M'Brakro", 'Yobouékro', 'Ando Yaokro', 'Commandankro', "Gbêlo N'Guessankro"],
  Guigbagui: ['Alikro', 'Krakro', 'Petit Bongouanou'],
  Touadji: ['Kedekro', 'Zebedekro', 'Bakayokobougou', 'Wankro'],
  Negreagui: ['Bakarybougou', 'Gbalakro', 'Yaokro', 'Broukro'],
  Miangadougou: ['Amouagui', 'Adjame', 'Loukoukro 1', 'Sakiare', 'Loukoukro 2', "N'Guessankro", 'Djezoukro'],
  Krohon: ['Felixkro', 'Amanikro', 'Oliekro', 'Kouassikro', 'Paulkro', "N'Da Kouamekro", 'Jeankro', 'Kouakou Emilekro'],
};

async function main() {
  console.log('Seed : création des secteurs, sites et acteurs de démonstration…');

  for (const [secteurNom, sites] of Object.entries(DEMO_SITES)) {
    const secteur = await prisma.secteur.upsert({
      where: { nom: secteurNom },
      update: {},
      create: { nom: secteurNom },
    });

    const pinHash = await bcrypt.hash('0000', 10);

    for (const siteNom of sites) {
      const site = await prisma.site.upsert({
        where: { secteurId_nom: { secteurId: secteur.id, nom: siteNom } },
        update: {},
        create: { nom: siteNom, secteurId: secteur.id },
      });

      await prisma.acteur.create({
        data: {
          nom: `Enseignant itinérant — ${siteNom}`,
          role: 'ENSEIGNANT_ITINERANT',
          pin: pinHash,
          secteurId: secteur.id,
          siteId: site.id,
        },
      });
    }

    const premierSite = await prisma.site.findFirst({ where: { secteurId: secteur.id } });
    await prisma.acteur.create({
      data: { nom: `Volontaire — ${secteurNom}`, role: 'VOLONTAIRE', pin: pinHash, secteurId: secteur.id, siteId: premierSite.id },
    });
    await prisma.acteur.create({
      data: { nom: `CPPP — ${secteurNom}`, role: 'CPPP', pin: pinHash, secteurId: secteur.id, siteId: premierSite.id },
    });
  }

  // Compte admin national (DRENAET) — À CHANGER après la première connexion
  const adminPasswordHash = await bcrypt.hash('changer-ce-mot-de-passe', 10);
  await prisma.admin.upsert({
    where: { email: 'admin@epi-meagui.ci' },
    update: {},
    create: {
      nom: 'Administrateur DRENAET',
      email: 'admin@epi-meagui.ci',
      passwordHash: adminPasswordHash,
      portee: 'NATIONALE',
    },
  });

  console.log('Seed terminé.');
  console.log('Compte admin de démonstration : admin@epi-meagui.ci / changer-ce-mot-de-passe');
  console.log("PIN de démonstration pour tous les acteurs : 0000");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
