'use strict';

const axios = require('axios');
const config = require('../config/env');
const { decrypt } = require('./crypto.service');
const logger = require('../utils/logger');

const SESSION_PATH = '/session';
const STATUS_PATH = '/status';

const http = axios.create({
  baseURL: config.wsapi.baseUrl,
  timeout: 30000,
  validateStatus: () => true, // handle non-2xx ourselves
});

function unwrap(data) {
  if (data && typeof data === 'object' && 'data' in data) return data.data;
  return data;
}

function assertOk(res) {
  if (res.status < 200 || res.status >= 300) {
    const detail = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const err = new Error(`WSAPI request failed (${res.status}): ${detail}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

function adminHeaders() {
  const headers = {};
  if (config.wsapi.adminKey) headers['X-WSAPI-Admin-Key'] = config.wsapi.adminKey;
  return headers;
}

/**
 * Per-instance identity: these two headers are what WSAPI uses to route a call
 * to the correct WhatsApp account. The api key is decrypted here and is never
 * available anywhere else in the request path.
 */
function instanceHeaders(instance) {
  return {
    'X-Instance-Id': instance.wsapiInstanceId,
    'X-Api-Key': decrypt(instance.wsapiApiKeyEncrypted),
  };
}

function normalizeCreate(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    instanceId: p.instanceId || p.instance_id || p.id || p.key || null,
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

/* ---------------------------------- /session/* ----------------------------------
 * GAP (§10): exact paths for creating an instance and requesting a pairing code
 * are not yet confirmed by Ahmed. These are PLACEHOLDER paths using the generic
 * /session/* shape; adjust once the real spec is available.
 */

/** Create a new WhatsApp instance/session and obtain its pairing code. */
async function createSession() {
  let res;
  try {
    res = await http.post(`${SESSION_PATH}/create`, { use_pairing_code: true }, { headers: adminHeaders() });
  } catch (err) {
    logger.error(`WSAPI network error on createSession: ${err.message}`);
    throw err;
  }
  assertOk(res);
  return normalizeCreate(unwrap(res.data));
}

/** Request a fresh pairing code for an existing instance. */
async function requestPairingCode(instance) {
  const res = await http.post(`${SESSION_PATH}/pairing-code`, null, { headers: instanceHeaders(instance) });
  assertOk(res);
  return normalizePairing(unwrap(res.data));
}

/** Disconnect/logout the instance. */
async function disconnectSession(instance) {
  const res = await http.post(`${SESSION_PATH}/disconnect`, null, { headers: instanceHeaders(instance) });
  assertOk(res);
  return unwrap(res.data);
}

/** Connection/login status of the instance (NOT WhatsApp Status content). */
async function getSessionStatus(instance) {
  const res = await http.get(`${SESSION_PATH}/status`, { headers: instanceHeaders(instance) });
  assertOk(res);
  return unwrap(res.data);
}

/* ---------------------------------- /status/* ----------------------------------
 * WhatsApp Status endpoints (confirmed by Calbrs Ahmed).
 */

/**
 * Publish a WhatsApp Status. `type` is one of text|image|video.
 * NOTE (blocker §10): the request body shape for /status/image and /status/video
 * is NOT officially confirmed yet — buildStatusPayload in dispatch.service is the
 * single place to adjust it once the OpenAPI schema is available.
 */
async function sendStatus(instance, type, payload) {
  const res = await http.post(`${STATUS_PATH}/${type}`, payload, { headers: instanceHeaders(instance) });
  assertOk(res);
  return unwrap(res.data);
}

/** List current statuses (get status info). */
async function listStatuses(instance) {
  const res = await http.get(STATUS_PATH, { headers: instanceHeaders(instance) });
  assertOk(res);
  return unwrap(res.data);
}

/** Delete a live WhatsApp Status by its WSAPI id. */
async function deleteStatus(instance, statusId) {
  const res = await http.delete(`${STATUS_PATH}/${encodeURIComponent(statusId)}`, {
    headers: instanceHeaders(instance),
  });
  assertOk(res);
  return unwrap(res.data);
}

module.exports = {
  createSession,
  requestPairingCode,
  disconnectSession,
  getSessionStatus,
  sendStatus,
  listStatuses,
  deleteStatus,
};