'use strict';

const { WhatsAppInstance } = require('../models');
const wsapi = require('./wsapi_client');
const { randomBytes } = require('../utils/token');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

function randomInstanceKey(businessId) {
  return randomBytes(`velie_${businessId}`, 8);
}

/**
 * Multi-Instance Mode guard: a business reuses an existing instance that is
 * still 'pending' or 'connected' instead of creating a duplicate.
 */
async function getOrCreateForBusiness(business) {
  const existing = await WhatsAppInstance.findOne({
    where: { businessId: business.id, status: ['pending', 'connected'] },
    order: [['createdAt', 'DESC']],
  });
  if (existing) return existing;

  let wsResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const instanceKey = randomInstanceKey(business.id);
    try {
      wsResponse = await wsapi.createInstance(instanceKey);
    } catch (err) {
      logger.warn(`WSAPI create instance attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === 2) throw new HttpError(502, 'Failed to reach WSAPI while creating the instance');
      continue;
    }

    try {
      return await WhatsAppInstance.create({
        businessId: business.id,
        instanceKey: wsResponse.instanceKey || instanceKey,
        status: 'pending',
        pairingCode: wsResponse.pairingCode || null,
        pairingCodeExpiresAt: normalizeDate(wsResponse.expiresAt),
      });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        logger.warn(`Instance key collision, retrying: ${err.message}`);
        continue;
      }
      throw err;
    }
  }

  throw new HttpError(409, 'Could not create a unique WhatsApp instance');
}

async function getForBusiness(business, instanceId) {
  const id = Number(instanceId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid instance id');
  const instance = await WhatsAppInstance.findOne({
    where: { id, businessId: business.id },
  });
  if (!instance) throw new HttpError(404, 'Instance not found');
  return instance;
}

async function refreshPairingCode(business, instanceId) {
  const instance = await getForBusiness(business, instanceId);
if (instance.status === 'connected') {
  throw new HttpError(409, 'Instance tayari imeunganishwa (connected)');
}

  let wsResponse;
  try {
    wsResponse = await wsapi.requestPairingCode(instance.instanceKey);
  } catch (err) {
    logger.error(`WSAPI pairing-code refresh failed for ${instance.instanceKey}: ${err.message}`);
    throw new HttpError(502, 'Failed to refresh pairing code');
  }

  const now = new Date();
  const expires = normalizeDate(wsResponse.expiresAt) || new Date(now.getTime() + 3 * 60 * 1000);

  instance.status = 'pending';
  instance.pairingCode = wsResponse.pairingCode || null;
  instance.pairingCodeExpiresAt = expires;
  await instance.save();

  return instance;
}

async function disconnect(business, instanceId) {
  const instance = await getForBusiness(business, instanceId);

  try {
    await wsapi.disconnectInstance(instance.instanceKey);
  } catch (err) {
    logger.warn(`WSAPI disconnect failed for ${instance.instanceKey}: ${err.message}`);
  }

  instance.status = 'disconnected';
  instance.pairingCode = null;
  instance.pairingCodeExpiresAt = null;
  instance.connectedAt = null;
  await instance.save();

  return instance;
}

/** Reconcile pairing code expiry from a webhook / client event. */
async function markPairingExpired(business, instanceId) {
  const instance = await getForBusiness(business, instanceId);
  instance.pairingCode = null;
  instance.pairingCodeExpiresAt = null;
  await instance.save();
  return instance;
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
  randomInstanceKey,
};