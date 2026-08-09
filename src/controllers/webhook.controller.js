'use strict';

const crypto = require('crypto');
const models = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');

const { WebhookEvent, WhatsAppInstance } = models;

// Per WSAPI wiki: X-Webhook-Signature: sha256=<hex>, HMAC-SHA256 over the raw body.
const SIGNATURE_HEADER = 'x-webhook-signature';

const EVENT_HANDLERS = {
  logged_in: async (instance) => {
    instance.status = 'connected';
    instance.connectedAt = new Date();
    instance.pairingCode = null;
    instance.pairingCodeExpiresAt = null;
    await instance.save();
  },
  logged_out: async (instance) => {
    instance.status = 'disconnected';
    instance.connectedAt = null;
    instance.pairingCode = null;
    instance.pairingCodeExpiresAt = null;
    await instance.save();
  },
  login_error: async (instance) => {
    instance.status = 'disconnected';
    instance.pairingCode = null;
    instance.pairingCodeExpiresAt = null;
    await instance.save();
  },
  initial_sync_finished: async () => {
    // Messages/history sync complete — nothing to persist here yet.
  },
};

function verifySignature(req) {
  const received = String(req.headers[SIGNATURE_HEADER] || '');
  const match = received.match(/^sha256=([0-9a-f]{64})$/i);
  if (!config.webhookSecret || !match) {
    const err = new Error('Invalid WSAPI webhook signature');
    err.status = 401;
    throw err;
  }

  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const expected = crypto
    .createHmac('sha256', config.webhookSecret)
    .update(raw)
    .digest('hex');

  const left = Buffer.from(match[1].toLowerCase());
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    const err = new Error('Invalid WSAPI webhook signature');
    err.status = 401;
    throw err;
  }
}

function findWsInstanceId(payload) {
  return payload.instanceId
    || payload.instance_id
    || payload.wsapiInstanceId
    || payload.wsapi_instance_id
    || (payload.data && (payload.data.instanceId || payload.data.instance_id))
    || null;
}

async function handleWebhook(req, res, next) {
  try {
    verifySignature(req);
    const payload = req.body || {};
    const eventType = String(payload.eventType || payload.event_type || 'unknown');

    const wsId = findWsInstanceId(payload);
    let instance = null;
    if (wsId) {
      instance = await WhatsAppInstance.findOne({ where: { wsapiInstanceId: wsId } });
    }

    await WebhookEvent.create({
      instanceId: instance ? instance.id : null,
      eventType,
      payload,
    });

    const handler = EVENT_HANDLERS[eventType];
    if (instance && handler) {
      await handler(instance, payload.data || payload);
    } else if (!instance) {
      logger.warn(`Webhook ${eventType}: no instance for id ${wsId}`);
    }

    return res.status(200).json({ received_at: new Date().toISOString() });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ message: err.message });
    return next(err);
  }
}

module.exports = { handleWebhook, findWsInstanceId };