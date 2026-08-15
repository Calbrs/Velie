'use strict';

const cron = require('node-cron');
const http = require('http');
const https = require('https');
const config = require('../config/env');
const logger = require('../utils/logger');

const DEFAULT_INTERVAL = 10 * 60 * 1000;

/**
 * Keep-alive heartbeat. Free-tier hosts (Render always-free, etc.) put
 * instances to sleep after a period without inbound traffic. Pinging our own
 * public /health URL on a schedule generates that traffic continuously so the
 * service stays awake and active at all times. Failures are only logged, never
 * fatal — an unreachable box is still alive and this must not take it down.
 */
function ping(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

let previous = null;

async function tick() {
  const url = `${config.publicBaseUrl}/health`;
  try {
    const status = await ping(url, 15000);
    if (status !== 200) {
      logger.warn(`Keep-alive ping to ${url} returned HTTP ${status}`);
      return;
    }
    // Heartbeat "active" marker: log once per interval boundary (no spam since
    // the default is every 10 minutes).
    const now = new Date();
    const bucket = Math.floor(now.getTime() / DEFAULT_INTERVAL);
    if (previous !== bucket) {
      previous = bucket;
      logger.info(`Keep-alive heartbeat ok (${url}, ${now.toISOString()})`);
    }
  } catch (err) {
    logger.warn(`Keep-alive ping to ${url} failed: ${err.message}`);
  }
}

function startKeepAliveWorker() {
  if (!config.keepAlive.enabled) {
    logger.info('Keep-alive worker disabled (KEEP_ALIVE_ENABLED=false)');
    return;
  }
  if (!cron.validate(config.keepAlive.cron)) {
    logger.warn(`Invalid KEEP_ALIVE_CRON '${config.keepAlive.cron}'`);
    return;
  }
  cron.schedule(config.keepAlive.cron, tick);
  logger.info(`Keep-alive worker started (cron: ${config.keepAlive.cron}, target: ${config.publicBaseUrl}/health)`);
}

function stopKeepAliveWorker() {
  cron.getTasks().forEach((task) => task.stop());
}

module.exports = { startKeepAliveWorker, stopKeepAliveWorker, tick };