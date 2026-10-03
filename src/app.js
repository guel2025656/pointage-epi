const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const secteurRoutes = require('./routes/secteurs');
const siteRoutes = require('./routes/sites');
const acteurRoutes = require('./routes/acteurs');
const pointageRoutes = require('./routes/pointages');
const absenceRoutes = require('./routes/absences');
const reportRoutes = require('./routes/reports');
const qrcodeRoutes = require('./routes/qrcodes');
const adminRoutes = require('./routes/admins');
const offlineRoutes = require('./routes/offline');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/secteurs', secteurRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/acteurs', acteurRoutes);
app.use('/api/pointages', pointageRoutes);
app.use('/api/absences', absenceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/qrcodes', qrcodeRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/offline', offlineRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
