'use strict';

const { WhatsAppInstance } = require('../models');
const wsapi = require('./wsapi_client');
const { encrypt } = require('../utils/cipher');
const { randomBytes } = require('../utils/token');
const HttpError = require('../utils/HttpError');
const logger = require('../utils/logger');

function randomWsInstanceId(userId) {
  return randomBytes(`inst_${userId}`, 6);
}

/**
 * Per-user instance resolver. A user may only ever act on instances they own
 * (`userId = req.user.id`) — this is the ownership boundary that prevents
 * cross-account instance access.
 */
async function getForUser(user, instanceId) {
  const id = Number(instanceId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid instance id');
  const instance = await WhatsAppInstance.findOne({
    where: { id, userId: user.id },
  });
  if (!instance) throw new HttpError(404, 'Instance haipo au sio yako');
  return instance;
}

/**
 * Create OR reuse a pending/connected instance for the user (no duplicate
 * instances per user) and obtain its pairing code from WSAPI.
 */
async function getOrCreateForUser(user) {
  const existing = await WhatsAppInstance.findOne({
    where: { userId: user.id, status: ['pending', 'connected'] },
    order: [['createdAt', 'DESC']],
  });
  if (existing) {
    if (!existing.pairingCode || pairingExpired(existing)) {
      return refreshPairingCode(user, existing.id);
    }
    return existing;
  }

  let created;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await wsapi.createInstance();
      const wsId = res.instanceId || randomWsInstanceId(user.id);

      const apiKeyEncrypted = encrypt(res.apiKey);
      created = await WhatsAppInstance.create({
        userId: user.id,
        wsapiInstanceId: wsId,
        wsapiApiKey: apiKeyEncrypted,
        status: 'pending',
        pairingCode: res.pairingCode || null,
        pairingCodeExpiresAt: normalizeDate(res.expiresAt),
      });
      return created;
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        logger.warn(`WSAPI instance id collision, retrying: ${err.message}`);
        continue;
      }
      logger.error(`Failed to create WSAPI instance for user ${user.id}: ${err.message}`);
      throw new HttpError(502, 'Failed to create WhatsApp instance on WSAPI');
    }
  }

  throw new HttpError(409, 'Could not mint a unique WSAPI instance');
}

async function refreshPairingCode(user, instanceId) {
  const instance = await getForUser(user, instanceId);
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

/**
 * Disconnect an instance (WSAPI logout) and mark it disconnected.
 * The user can only disconnect an instance they own.
 */
async function disconnect(user, instanceId) {
  const instance = await getForUser(user, instanceId);
  try {
    await wsapi.disconnectInstance(instance);
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

async function markPairingExpired(user, instanceId) {
  const instance = await getForUser(user, instanceId);
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
  getOrCreateForUser,
  getForUser,
  refreshPairingCode,
  disconnect,
  markPairingExpired,
  randomWsInstanceId,
  pairingExpired,
};