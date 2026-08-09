'use strict';

const cron = require('node-cron');
const config = require('../config/env');
const media = require('../services/media.service');
const logger = require('../utils/logger');

let running = false;

/**
 * Hourly media cleanup: remove hybrid-storage assets whose expiry has passed and
 * which are no longer referenced by any pending post. Keeps storage low —
 * Velie is a scheduler/controller, not a permanent WhatsApp media archive.
 */
async function tick() {
  if (running) return;
  running = true;
  try {
    const removed = await media.runCleanup();
    if (removed > 0) logger.info(`Media cleanup removed ${removed} asset(s).`);
  } catch (err) {
    logger.error(`Media cleanup failed: ${err.message}`);
  } finally {
    running = false;
  }
}

function startMediaCleanupWorker() {
  if (!cron.validate(config.cleanup.cron)) {
    logger.warn(`Invalid MEDIA_CLEANUP_CRON '${config.cleanup.cron}'`);
    return;
  }
  cron.schedule(config.cleanup.cron, tick);
  logger.info(`Media cleanup worker started (cron: ${config.cleanup.cron})`);
}

function stopMediaCleanupWorker() {
  cron.getTasks().forEach((task) => task.stop());
}

module.exports = { startMediaCleanupWorker, stopMediaCleanupWorker };