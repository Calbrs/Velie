'use strict';

require('dotenv').config();
const logger = require('../utils/logger');

function read(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readNumber(name, fallback) {
  const value = Number(read(name, fallback));
  if (Number.isNaN(value)) throw new Error(`Environment variable ${name} must be a number`);
  return value;
}

const port = readNumber('PORT', 4000);

const config = {
  env: read('NODE_ENV', 'development'),
  port,
  db: {
    host: read('DB_HOST', '127.0.0.1'),
    port: readNumber('DB_PORT', 3306),
    user: read('DB_USER', 'root'),
    password: read('DB_PASS', ''),
    name: read('DB_NAME', 'velie_db'),
    ssl: read('DB_SSL', 'false') === 'true',
  },
  wsapi: {
    // The gateway (whatsapp-web.js) is embedded in this same Express server and
    // served on the backend's own port, so the backend always reaches it at
    // localhost:PORT. WSAPI_BASE_URL was only for the old standalone gateway;
    // it is deliberately ignored here to avoid a stale dashboard override.
    baseUrl: `http://localhost:${port}`,
    // Accept either key so the single admin key configured in the deployment
    // works for both the backend (sends X-Api-Key) and the embedded gateway
    // (validates it via requireAdmin).
    adminKey: read('WSAPI_ADMIN_KEY', read('ADMIN_KEY', '')),
  },
  encryptionKey: read('ENCRYPTION_KEY', ''),
  uploads: {
    dir: read('UPLOAD_DIR', './uploads'),
    maxImageSizeMb: readNumber('MAX_IMAGE_SIZE_MB', 8),
  },
  dispatch: {
    cron: read('DISPATCH_INTERVAL_CRON', '* * * * *'),
    minDelayMs: readNumber('DISPATCH_MIN_DELAY_MS', 30000),
    maxDelayMs: readNumber('DISPATCH_MAX_DELAY_MS', 60000),
  },
  cleanup: {
    cron: read('MEDIA_CLEANUP_CRON', '0 * * * *'),
    retentionHours: readNumber('MEDIA_RETENTION_HOURS', 24),
  },
  publicBaseUrl: read('PUBLIC_BASE_URL', 'http://localhost:4000').replace(/\/$/, ''),
  webhookSecret: read('WEBHOOK_SECRET', ''),
  keepAlive: {
    // Ping the public health URL on a fixed interval so free-tier hosts
    // (Render, etc.) never idle the process to sleep. Also acts as an
    // opportunistic reachability check for the box itself.
    enabled: read('KEEP_ALIVE_ENABLED', 'true') === 'true',
    cron: read('KEEP_ALIVE_CRON', '*/10 * * * *'),
  },
  viewerRefresh: {
    // Keep Status viewer counts fresh while the status is live (24h window).
    cron: read('VIEWER_REFRESH_CRON', '*/5 * * * *'),
  },
  videoRender: {
    // Local video rendering with a bundled ffmpeg binary (ffmpeg-static). When
    // VIDEO_RENDER_SIMULATE=true the job "completes" instantly using the source
    // URL so the app flow can be exercised without encoding.
    simulate: read('VIDEO_RENDER_SIMULATE', 'false') === 'true',
    simulateDelayMs: readNumber('VIDEO_RENDER_SIMULATE_DELAY_MS', 8000),
    // Optional override for the font used by drawtext overlays. Defaults to the
    // bundled DejaVuSans.ttf under assets/fonts.
    fontFile: read('VIDEO_RENDER_FONT_FILE', ''),
  },
};

if (!config.dispatch.cron.trim()) config.dispatch.cron = '* * * * *';
if (!config.cleanup.cron.trim()) config.cleanup.cron = '0 * * * *';
if (!config.keepAlive.cron.trim()) config.keepAlive.cron = '*/10 * * * *';
if (!config.viewerRefresh.cron.trim()) config.viewerRefresh.cron = '*/5 * * * *';
if (config.encryptionKey && config.encryptionKey.length < 16 && config.env === 'production') {
  logger.warn('ENCRYPTION_KEY looks too short; use a strong 32-byte key in production.');
}
if (config.webhookSecret === 'change-me-webhook-secret' && config.env === 'production') {
  logger.warn('WEBHOOK_SECRET is set to a known default value; change it in production.');
}

module.exports = config;