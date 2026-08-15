'use strict';

const config = require('../config/env');
const models = require('../models');
const { decrypt } = require('./crypto.service');
const store = require('../../gateway/src/store');
const sessions = require('../../gateway/src/sessions');
const logger = require('../utils/logger');

/**
 * Rebuild the in-process gateway's instance store from the DB at boot. The
 * gateway keeps its registrations in a JSON file, which is ephemeral on hosts
 * like Render (reset on redeploy); the DB is the source of truth, so we
 * re-register every instance (with its decrypted api key + webhook config)
 * before the server starts serving.
 */
async function syncGatewayInstances() {
  const rows = await models.WhatsAppInstance.findAll();
  let synced = 0;
  for (const row of rows) {
    try {
      store.upsert({
        id: row.wsapiInstanceId,
        apiKey: decrypt(row.wsapiApiKeyEncrypted),
        webhookUrl: `${config.publicBaseUrl}/api/webhook/wsapi`,
        signingSecret: config.webhookSecret || null,
      });
      synced += 1;
    } catch (err) {
      logger.warn(`Gateway sync skipped instance ${row.wsapiInstanceId}: ${err.message}`);
    }
  }
  logger.info(`Gateway store synced from DB (${synced} instances)`);
}

/**
 * Eagerly start sessions for every synced instance so the WhatsApp restore
 * happens in the background right after boot instead of lazily on the first
 * send. This keeps the instance "always active" and makes the first post after
 * a restart fast instead of waiting through a cold (~60s+) WhatsApp restore.
 * Failed restores are non-fatal: sendStatus will retry with its own wait.
 */
function preWarmSessions() {
  const instances = store.getAll();
  if (instances.length === 0) return;
  logger.info(`Pre-warming session(s) for ${instances.length} instance(s)`);
  for (const instance of instances) {
    sessions.start(instance).catch((err) => {
      logger.warn(`Session pre-warm failed for ${instance.id}: ${err.message}`);
    });
  }
}

module.exports = { syncGatewayInstances, preWarmSessions };
