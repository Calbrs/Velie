'use strict';

const cron = require('node-cron');
const config = require('../config/env');
const dispatchService = require('../services/dispatch.service');
const logger = require('../utils/logger');

let running = false;

/**
 * Cron tick: grab posts whose scheduled_time has arrived and dispatch them
 * with the anti-ban stagger (30–60s between posts sent on the same instance).
 */
async function tick() {
  if (running) return;
  running = true;
  try {
    const processed = await dispatchService.runDispatchCycle();
    if (processed > 0) logger.info(`Dispatch cycle processed ${processed} post(s).`);
  } catch (err) {
    logger.error(`Dispatch cycle failed: ${err.message}`);
  } finally {
    running = false;
  }
}

function startDispatchWorker() {
  if (!cron.validate(config.dispatch.cron)) {
    logger.warn(`Invalid DISPATCH_INTERVAL_CRON '${config.dispatch.cron}'`);
    return;
  }
  cron.schedule(config.dispatch.cron, tick);
  logger.info(`Dispatch worker started (cron: ${config.dispatch.cron})`);
}

function stopDispatchWorker() {
  cron.getTasks().forEach((task) => task.stop());
}

module.exports = { startDispatchWorker, stopDispatchWorker };