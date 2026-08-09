'use strict';

const { WhatsAppInstance } = require('../models');
const wsapi = require('./wsapi_client');
const { encrypt } = require('./crypto.service');
const { randomBytes } = require('../utils/token');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

function randomWsInstanceId(businessId) {
  return randomBytes(`inst_${businessId}`, 6);
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
 * The WSAPI api-key is encrypted before storage and is never returned anywhere.
 */
async function getOrCreateForBusiness(business) {
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await wsapi.createSession();
      const wsId = res.instanceId || randomWsInstanceId(business.id);

      return await WhatsAppInstance.create({
        businessId: business.id,
        wsapiInstanceId: wsId,
        wsapiApiKeyEncrypted: encrypt(res.apiKey)
          ? Buffer.from(encrypt(res.apiKey), 'utf8')
          : null,
        status: 'pending',
        pairingCode: res.pairingCode || null,
        pairingCodeExpiresAt: normalizeDate(res.expiresAt),
      });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        logger.warn(`WSAPI instance id collision, retrying: ${err.message}`);
        continue;
      }
      logger.error(`Failed to create WSAPI session for business ${business.id}: ${err.message}`);
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

  let res;
  try {
    res = await wsapi.requestPairingCode(instance);
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
    await wsapi.disconnectSession(instance);
  } catch (err) {
    logger.warn(`WS disconnect failed for ${instance.wsapiInstanceId}: ${err.message}`);
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
  pairingExpired,
};