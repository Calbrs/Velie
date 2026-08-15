'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { testConnection } = require('./config/db');
const routes = require('./routes');
const { uploadDir } = require('./services/upload.service');
const { syncGatewayInstances, preWarmSessions } = require('./services/gateway_bridge');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { startDispatchWorker } = require('./jobs/dispatch_worker');
const { startMediaCleanupWorker } = require('./jobs/media_cleanup_worker');
const { startKeepAliveWorker } = require('./jobs/keep_alive_worker');
const { startViewerRefreshWorker } = require('./jobs/viewer_refresh_worker');
const logger = require('./utils/logger');

// The Velie Gateway (whatsapp-web.js) is embedded in this service and exposed
// on the same URL (/: /admin, /session, /status) so the backend and the gateway
// are one deployment.
const gatewayApp = require('../gateway/src/app');

const app = express();

app.disable('x-powered-by');
app.use(cors());
// Keep the raw body so webhooks can verify HMAC-SHA256 (X-Webhook-Signature).
// Limit must cover base64 status media (~11MB for an 8MB file).
app.use(express.json({ limit: '20mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// Gateway routes first so /admin, /session, /status hit the embedded gateway.
app.use(gatewayApp);

app.use('/uploads', express.static(uploadDir));

// Lightweight uptime endpoint for Render health checks / cron-job.org keep-alive.
// Must respond 200 — no heavy logic needed to keep a free Render service awake.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  try {
    await testConnection();
  } catch (err) {
    logger.error('Server not started: database unavailable');
    process.exit(1);
  }

  try {
    await syncGatewayInstances();
  } catch (err) {
    logger.error(`Gateway store sync failed: ${err.message}`);
    process.exit(1);
  }

  startDispatchWorker();
  startMediaCleanupWorker();
  startKeepAliveWorker();
  startViewerRefreshWorker();

  app.listen(config.port, () => {
    logger.info(`Velie Backend listening on port ${config.port} (${config.env})`);
    // Eagerly restore WhatsApp sessions off the boot path so the first post
    // after a restart doesn't sit behind a cold ~130s restore.
    setTimeout(preWarmSessions, 1500);
  });
}

bootstrap();

module.exports = app;