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

const config = {
  env: read('NODE_ENV', 'development'),
  port: readNumber('PORT', 4000),
  db: {
    host: read('DB_HOST', '127.0.0.1'),
    port: readNumber('DB_PORT', 3306),
    user: read('DB_USER', 'root'),
    password: read('DB_PASS', ''),
    name: read('DB_NAME', 'velie_db'),
  },
  wsapi: {
    baseUrl: read('WSAPI_BASE_URL', 'https://velie.onrender.com').replace(/\/$/, ''),
    adminKey: read('WSAPI_ADMIN_KEY', ''),
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
};

if (!config.dispatch.cron.trim()) config.dispatch.cron = '* * * * *';
if (!config.cleanup.cron.trim()) config.cleanup.cron = '0 * * * *';
if (config.encryptionKey && config.encryptionKey.length < 16 && config.env === 'production') {
  logger.warn('ENCRYPTION_KEY looks too short; use a strong 32-byte key in production.');
}
if (config.webhookSecret === 'change-me-webhook-secret' && config.env === 'production') {
  logger.warn('WEBHOOK_SECRET is set to a known default value; change it in production.');
}

module.exports = config;