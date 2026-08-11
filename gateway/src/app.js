'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const admin = require('./routes/admin');
const session = require('./routes/session');
const status = require('./routes/status');
const { requireAdmin, requireInstance } = require('./middleware');

function crashLog(line) {
  try {
    const file = path.join(__dirname, '..', 'data', 'crash.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`);
  } catch (e) {
    /* ignore */
  }
}

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack || ''}` : String(reason);
  console.error('[crash] unhandledRejection:', msg);
  crashLog(`unhandledRejection: ${msg}`);
});
process.on('uncaughtException', (err) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
  console.error('[crash] uncaughtException:', msg);
  crashLog(`uncaughtException: ${msg}`);
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));

setInterval(() => {
  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);
  if (rss > 400) console.log(`[mem] rss=${rss}MB heap=${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
}, 10000);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/admin', requireAdmin, admin);
app.use('/session', requireInstance, session);
app.use('/status', requireInstance, status);

module.exports = app;
