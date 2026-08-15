'use strict';

const cron = require('node-cron');
const config = require('../config/env');
const viewerService = require('../services/viewer.service');
const logger = require('../utils/logger');

let running = false;

/**
 * Periodically refresh Status viewer counts for sent posts. WhatsApp only keeps
 * statuses live for 24h and the viewer list grows over time, so this keeps the
 * stored viewer_count fresh while the status is still on WhatsApp.
 */
async function tick() {
  if (running) return;
  running = true;
  try {
    const processed = await viewerService.refreshAllViewers();
    if (processed > 0) logger.info(`Viewer refresh processed ${processed} post(s).`);
  } catch (err) {
    logger.warn(`Viewer refresh failed: ${err.message}`);
  } finally {
    running = false;
  }
}

function startViewerRefreshWorker() {
  if (!cron.validate(config.viewerRefresh.cron)) {
    logger.warn(`Invalid VIEWER_REFRESH_CRON '${config.viewerRefresh.cron}'`);
    return;
  }
  cron.schedule(config.viewerRefresh.cron, tick);
  logger.info(`Viewer refresh worker started (cron: ${config.viewerRefresh.cron})`);
}

function stopViewerRefreshWorker() {
  cron.getTasks().forEach((task) => task.stop());
}

module.exports = { startViewerRefreshWorker, stopViewerRefreshWorker, tick };