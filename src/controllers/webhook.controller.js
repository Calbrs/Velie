'use strict';

const crypto = require('crypto');
const models = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');

const { WebhookEvent, WhatsAppInstance } = models;

const SIGNATURE_HEADER = 'x-wsapi-signature';
const EVENT_HANDLERS = {
  pairing_success: async (instance, payload) => {
    instance.status = 'connected';
    instance.connectedAt = new Date();
    instance.pairingCode = null;
    instance.pairingCodeExpiresAt = null;
    await instance.save();
  },
  disconnected: async (instance) => {
    instance.status = 'disconnected';
    instance.connectedAt = null;
    instance.pairingCode = null;
    instance.pairingCodeExpiresAt = null;
    await instance.save();
  },
  pairing_code_expired: async (instance) => {
    instance.pairingCode = null;
    instance.pairingCodeExpiresAt = null;
    await instance.save();
  },
  message_ack: async () => {
    // Optional: cross-reference posts_schedule by message id for extra "sent" evidence (Phase 2)
  },
};

function signaturesMatch(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifySignature(req) {
  const received = req.headers[SIGNATURE_HEADER];
  if (!config.webhookSecret || !received || !signaturesMatch(received, config.webhookSecret)) {
    const err = new Error('Invalid WSAPI webhook signature');
    err.status = 401;
    throw err;
  }
}

function findInstanceKey(payload) {
  return payload.instanceKey
    || payload.instance_key
    || payload.key
    || (payload.data && (payload.data.instanceKey || payload.data.instance_key))
    || null;
}

async function handleWebhook(req, res, next) {
  try {
    verifySignature(req);
    const payload = req.body || {};

    const instanceKey = findInstanceKey(payload);
    let instance = null;
    if (instanceKey) {
      instance = await WhatsAppInstance.findOne({ where: { instanceKey } });
    }

    await WebhookEvent.create({
      instanceId: instance ? instance.id : null,
      eventType: String(payload.event_type || payload.eventType || 'unknown'),
      payload,
    });

    if (instance && EVENT_HANDLERS[payload.event_type]) {
      const handler = EVENT_HANDLERS[payload.event_type];
      await handler(instance, payload);
    } else if (!instance) {
      logger.warn(`Webhook: no instance found for key ${instanceKey}`);
    }

    return res.status(200).json({ received_at: new Date().toISOString() });
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ message: err.message });
    return next(err);
  }
}

module.exports = { handleWebhook, findInstanceKey };