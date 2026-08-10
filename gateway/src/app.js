'use strict';

const express = require('express');
const admin = require('./routes/admin');
const session = require('./routes/session');
const status = require('./routes/status');
const { requireAdmin, requireInstance } = require('./middleware');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/admin', requireAdmin, admin);
app.use('/session', requireInstance, session);
app.use('/status', requireInstance, status);

module.exports = app;
