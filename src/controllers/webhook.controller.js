'use strict';

const crypto = require('crypto');
const models = require('../models');
const config = require('../config/env');
const logger = require('../utils/logger');

const { WebhookEvent, WhatsAppInstance } = models;

const SIGNATURE_HEADER = 'x-wsapi-signature';
const EVENT_HANDLERS = {
  session_connected: async (instance) => {
    instance.status = 'connected';
    instance.connectedAt = new Date();
    instance.pairingCode = null;
    instance.pairingCodeExpiresAt = null;
    await instance.save();
  },
  session_disconnected: async (instance) => {
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

function findWsInstanceId(payload) {
  return payload.wsapiInstanceId
    || payload.wsapi_instance_id
    || payload.instanceId
    || payload.instance_id
    || (payload.data && (payload.data.instanceId || payload.data.instance_id))
    || null;
}

async function handleWebhook(req, res, next) {
  try {
    verifySignature(req);
    const payload = req.body || {};
    const eventType = String(payload.event_type || payload.eventType || 'unknown');

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
      await handler(instance, payload);
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