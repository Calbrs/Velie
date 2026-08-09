'use strict';

const { WhatsAppInstance } = require('../models');
const wsapi = require('./wsapi_client');
const { encrypt } = require('./crypto.service');
const { generateAccessToken, randomBytes } = require('../utils/token');
const config = require('../config/env');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

function randomWsInstanceId(businessId) {
  return randomBytes(`inst_${businessId}`, 6);
}

/** Pair-code endpoints want the E.164 number: '+' followed by digits (no spaces/dashes). */
function toE164(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits ? `+${digits}` : '';
}

/**
 * Ownership boundary: every instance operation is scoped to the authenticated
 * business, so one business can never touch another business's instance.
 */
async function getForBusiness(business, instanceId) {
  const id = Number(instanceId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid instance id');
  const instance = await WhatsAppInstance.findOne({
    where: { id, businessId: business.id },
  });
  if (!instance) throw new HttpError(404, 'Instance haipo au sio yako');
  return instance;
}

/**
 * Create OR reuse the business's instance (one per business in this phase).
 * We mint the instance id + a per-instance api key and register it on WSAPI via
 * the admin API (/admin/instances), pointing the webhook at our backend so
 * logged_in/logged_out events reach us. The api key is encrypted before storage
 * and is never returned anywhere.
 */
/**
 * The webhook URL WSAPI must call must point at THIS backend as reachable from
 * the internet. Prefer the URL derived from the incoming request (works on
 * Render without any env var), falling back to PUBLIC_BASE_URL for local dev.
 */
function resolvePublicBaseUrl(req) {
  if (req && req.get) {
    const host = req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol;
    if (host) return `${proto}://${host}`;
  }
  return config.publicBaseUrl;
}

async function getOrCreateForBusiness(business, publicBaseUrl) {
  const existing = await WhatsAppInstance.findOne({
    where: { businessId: business.id, status: ['pending', 'connected'] },
    order: [['createdAt', 'DESC']],
  });
  if (existing) {
    if (!existing.pairingCode || pairingExpired(existing)) {
      return refreshPairingCode(business, existing.id);
    }
    return existing;
  }

  const instanceId = randomWsInstanceId(business.id);
  const apiKey = generateAccessToken(32);
  const webhookUrl = `${publicBaseUrl || config.publicBaseUrl}/api/webhook/wsapi`;
  const signingSecret = config.webhookSecret || undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await wsapi.createInstance({ id: instanceId, apiKey, webhookUrl, signingSecret });

      const instance = await WhatsAppInstance.create({
        businessId: business.id,
        wsapiInstanceId: instanceId,
        wsapiApiKeyEncrypted: Buffer.from(encrypt(apiKey), 'utf8'),
        status: 'pending',
        pairingCode: null,
        pairingCodeExpiresAt: null,
      });

      try {
        return await refreshPairingCode(business, instance.id);
      } catch (err) {
        // Pair-code fetch failed but the instance exists — return it anyway so
        // the frontend can call the refresh endpoint again.
        logger.warn(`Instance ${instanceId} created but pairing code unavailable: ${err.message}`);
        return instance;
      }
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        logger.warn(`WSAPI instance id collision, retrying: ${err.message}`);
        continue;
      }
      logger.error(`Failed to create WSAPI instance for business ${business.id}: ${err.message}`);
      throw new HttpError(502, 'Failed to create WhatsApp instance on WSAPI');
    }
  }

  throw new HttpError(409, 'Could not mint a unique WSAPI instance');
}

async function refreshPairingCode(business, instanceId) {
  const instance = await getForBusiness(business, instanceId);
  if (instance.status === 'connected') {
    throw new HttpError(422, 'Instance tayari imeunganishwa (connected)');
  }

  const phone = toE164(business.ownerPhone);
  if (!phone) throw new HttpError(400, 'owner_phone haipo kwenye business hii');

  let res;
  try {
    res = await wsapi.requestPairingCode(instance, phone);
  } catch (err) {
    logger.error(`Pairing-code refresh failed for ${instance.wsapiInstanceId}: ${err.message}`);
    throw new HttpError(502, 'Failed to refresh pairing code from WSAPI');
  }

  const now = new Date();
  instance.status = 'pending';
  instance.pairingCode = res.pairingCode || null;
  instance.pairingCodeExpiresAt = normalizeDate(res.expiresAt) || new Date(now.getTime() + 3 * 60 * 1000);
  await instance.save();
  return instance;
}

async function disconnect(business, instanceId) {
  const instance = await getForBusiness(business, instanceId);
  try {
    await wsapi.logout(instance);
  } catch (err) {
    logger.warn(`WS logout failed for ${instance.wsapiInstanceId}: ${err.message}`);
  }

  instance.status = 'disconnected';
  instance.pairingCode = null;
  instance.pairingCodeExpiresAt = null;
  instance.connectedAt = null;
  await instance.save();
  return instance;
}

async function markPairingExpired(business, instanceId) {
  const instance = await getForBusiness(business, instanceId);
  instance.pairingCode = null;
  instance.pairingCodeExpiresAt = null;
  await instance.save();
  return instance;
}

function pairingExpired(instance) {
  return !instance.pairingCodeExpiresAt || new Date(instance.pairingCodeExpiresAt) < new Date();
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = {
  getOrCreateForBusiness,
  getForBusiness,
  refreshPairingCode,
  disconnect,
  markPairingExpired,
  randomWsInstanceId,
  resolvePublicBaseUrl,
  pairingExpired,
};