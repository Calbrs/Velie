'use strict';

const config = require('../config/env');
const { decrypt } = require('../utils/cipher');
const logger = require('../utils/logger');

const INSTANCE_PATH = '/api/instances';

async function _request(path, { method = 'GET', body = null, context = null } = {}) {
  const url = `${config.wsapi.baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };

  if (context) {
    // Per-instance identity: this exact WhatsApp account on WSAPI.
    headers['X-Instance-Id'] = context.instanceId;
    if (context.apiKey) headers['X-Api-Key'] = context.apiKey;
  } else if (config.wsapi.adminKey) {
    // Admin-level operation (creating a new instance for a user).
    headers['X-WSAPI-Admin-Key'] = config.wsapi.adminKey;
  }

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

function normalizeInstanceCreate(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    instanceId: p.instanceId || p.instance_id || p.key || p.id || null,
    apiKey: p.apiKey || p.api_key || p.token || null,
    pairingCode: p.pairingCode || p.pairing_code || p.code || null,
    expiresAt: p.pairingCodeExpiresAt || p.pairing_code_expires_at || p.expiration || p.expiresAt || null,
  };
}

function normalizePairing(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    pairingCode: p.pairingCode || p.pairing_code || p.code || null,
    expiresAt: p.pairingCodeExpiresAt || p.pairing_code_expires_at || p.expiration || p.expiresAt || null,
  };
}

/**
 * Resolve the X-Instance-Id / X-Api-Key context from a persisted instance row.
 * The stored api_key is encrypted; it is decrypted here and NEVER returned anywhere upstream.
 */
function apiContextFor(instance) {
  if (!instance) return null;
  return {
    instanceId: instance.wsapiInstanceId,
    apiKey: decrypt(instance.wsapiApiKey),
  };
}

/**
 * Create a brand-new WhatsApp instance on the WSAPI (admin scope).
 * Returns `{ instanceId, apiKey, pairingCode, expiresAt }`.
 * The returned apiKey is encrypted into our DB in instance.service.
 * The WSAPI must run in pairing-code mode (Baileys requestPairingCode).
 */
async function createInstance() {
  const { data } = await _request(`${INSTANCE_PATH}/create`, {
    method: 'POST',
    body: { use_pairing_code: true },
  });
  return normalizeInstanceCreate(unwrap(data));
}

/** Request a fresh pairing code for an existing instance. */
async function requestPairingCode(instance) {
  const context = apiContextFor(instance);
  const { data } = await _request(`${INSTANCE_PATH}/${context.instanceId}/pairing-code`, {
    method: 'POST',
    context,
  });
  return normalizePairing(unwrap(data));
}

/** Disconnect (logout) an instance. */
async function disconnectInstance(instance) {
  const context = apiContextFor(instance);
  await _request(`${INSTANCE_PATH}/${context.instanceId}/disconnect`, { method: 'POST', context });
}

/** Publish an image content_as a WhatsApp Status on THIS account's instance. */
async function sendWhatsAppStatus(instance, { mediaUrl, content }) {
  const context = apiContextFor(instance);
  const { data } = await _request(`${INSTANCE_PATH}/${context.instanceId}/status/image`, {
    method: 'POST',
    body: { media_url: mediaUrl, caption: content },
    context,
  });
  return unwrap(data);
}

/** Send an image content to a WhatsApp group with THIS instance. */
async function sendWhatsAppGroupMessage(instance, groupId, { mediaUrl, content }) {
  const context = apiContextFor(instance);
  const { data } = await _request(`${INSTANCE_PATH}/${context.instanceId}/send/group`, {
    method: 'POST',
    body: { group_id: groupId, image: mediaUrl, caption: content },
    context,
  });
  return unwrap(data);
}

/** Delete a previously published status on the instance OWNED by this instance. */
async function deleteStatus(instance, { mediaUrl } = {}) {
  const context = apiContextFor(instance);
  const query = mediaUrl ? `?media_url=${encodeURIComponent(mediaUrl)}` : '';
  await _request(`${INSTANCE_PATH}/${context.instanceId}/status${query}`, {
    method: 'DELETE',
    context,
  });
}

module.exports = {
  createInstance,
  requestPairingCode,
  disconnectInstance,
  sendWhatsAppStatus,
  sendWhatsAppGroupMessage,
  deleteStatus,
};