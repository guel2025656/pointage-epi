require('dotenv').config();
const app = require('./app');
const { creerAdminInitial } = require('./lib/bootstrap');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Pointage EPI en écoute sur le port ${PORT}`);
  creerAdminInitial().catch((e) => console.error('Création du compte administrateur impossible :', e.message));
});
