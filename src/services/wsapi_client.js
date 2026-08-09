'use strict';

const config = require('../config/env');
const logger = require('../utils/logger');

const INSTANCE_PATH = '/api/instances';

async function _request(path, { method = 'GET', body = null } = {}) {
  const url = `${config.wsapi.baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.wsapi.adminKey) headers['X-WSAPI-Admin-Key'] = config.wsapi.adminKey;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    logger.error(`WSAPI network error for ${method} ${url}: ${err.message}`);
    throw err;
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!res.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    const err = new Error(`WSAPI request failed (${res.status}): ${detail}`);
    err.status = res.status;
    throw err;
  }

  return { status: res.status, data };
}

function unwrap(data) {
  if (data && typeof data === 'object' && 'data' in data) return data.data;
  return data;
}

/**
 * Create/connect a new WhatsApp instance on the WSAPI and request a pairing code.
 * The self-hosted WSAPI must support pairing-code mode (Baileys requestPairingCode).
 */
async function createInstance(instanceKey) {
  const { data } = await _request(`${INSTANCE_PATH}/create`, {
    method: 'POST',
    body: { instance_key: instanceKey, usePairingCode: true },
  });
  return normalizePairing(unwrap(data));
}

/** Request a fresh pairing code for an existing instance. */
async function requestPairingCode(instanceKey) {
  const { data } = await _request(`${INSTANCE_PATH}/${instanceKey}/pairing-code`, { method: 'POST' });
  return normalizePairing(unwrap(data));
}

/** Disconnect (logout) an instance. */
async function disconnectInstance(instanceKey) {
  const { data } = await _request(`${INSTANCE_PATH}/${instanceKey}/disconnect`, { method: 'POST' });
  return unwrap(data);
}

/** Fetch live pairing code (with expiration) for an instance. */
async function getPairingCode(instanceKey) {
  const { data } = await _request(`${INSTANCE_PATH}/${instanceKey}`, { method: 'GET' });
  return normalizePairing(unwrap(data));
}

function normalizePairing(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    instanceKey: p.instanceKey || p.instance_key || p.key || null,
    pairingCode: p.pairingCode || p.pairing_code || p.code || null,
    expiresAt: p.pairingCodeExpiresAt || p.pairing_code_expires_at || p.expiration || p.expiresAt || null,
  };
}

/** Publish an image caption as a WhatsApp Status. */
async function sendWhatsAppStatus(instanceKey, { imageUrl, caption }) {
  const { data } = await _request(`${INSTANCE_PATH}/${instanceKey}/send/status`, {
    method: 'POST',
    body: { image: imageUrl, caption },
  });
  return unwrap(data);
}

/** Send an image caption message to a WhatsApp group. */
async function sendWhatsAppGroupMessage(instanceKey, groupId, { imageUrl, caption }) {
  const { data } = await _request(`${INSTANCE_PATH}/${instanceKey}/send/group`, {
    method: 'POST',
    body: { group_id: groupId, image: imageUrl, caption },
  });
  return unwrap(data);
}

module.exports = {
  createInstance,
  requestPairingCode,
  disconnectInstance,
  getPairingCode,
  sendWhatsAppStatus,
  sendWhatsAppGroupMessage,
};