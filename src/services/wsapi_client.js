'use strict';

const axios = require('axios');
const config = require('../config/env');
const { decrypt } = require('./crypto.service');
const logger = require('../utils/logger');

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

/**
 * Admin endpoints (/admin/instances/*) use the admin API key.
 * Header is X-Api-Key = WSAPI_ADMIN_API_KEY (set on the WSAPI server).
 */
function adminHeaders() {
  const headers = {};
  if (config.wsapi.adminKey) headers['X-Api-Key'] = config.wsapi.adminKey;
  return headers;
}

/**
 * Instance endpoints require X-Instance-Id + X-Api-Key (the instance's own key,
 * decrypted here — never available anywhere else in the request path).
 */
function instanceHeaders(instance) {
  return {
    'X-Instance-Id': instance.wsapiInstanceId,
    'X-Api-Key': decrypt(instance.wsapiApiKeyEncrypted),
  };
}

function normalizePairing(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    pairingCode: p.pairCode || p.pair_code || p.code || p.pairingCode || p.pairing_code || null,
    expiresAt: p.expiresAt || p.expires_at || p.expiration || null,
  };
}

/* ------------------------------ Admin: /admin/instances/* ------------------------------ */

/**
 * Create a new instance in Multi Mode. We supply the instance id, its own api key,
 * the webhook URL (events) and the signing secret (HMAC) so events hit our
 * /api/webhook/wsapi. The id/apiKey values we send are the ones that get stored.
 */
async function createInstance({ id, apiKey, webhookUrl, signingSecret }) {
  const body = { id };
  if (apiKey) body.apiKey = apiKey;
  if (webhookUrl) body.webhookUrl = webhookUrl;
  if (signingSecret) body.signingSecret = signingSecret;

  const res = await http.post('/admin/instances', body, { headers: adminHeaders() });
  assertOk(res);
  return unwrap(res.data) || res.data;
}

/* --------------------------------- /session/* --------------------------------- */

/**
 * Get the pairing code for a phone number: GET /session/pair-code/{phone}.
 * The WSAPI validates the phone as a literal path segment starting with '+';
 * URL-encoding '+' as %2B fails its phone check, so we send the '+' raw and
 * only encode the rest of the path.
 */
async function requestPairingCode(instance, phone) {
  const res = await http.get(`/session/pair-code/${phone}`, {
    headers: instanceHeaders(instance),
  });
  assertOk(res);
  return normalizePairing(unwrap(res.data));
}

/** Connection/login status of the instance (NOT WhatsApp Status content). */
async function getSessionStatus(instance) {
  const res = await http.get('/session/status', { headers: instanceHeaders(instance) });
  assertOk(res);
  return unwrap(res.data);
}

/** Logout/disconnect the WhatsApp session. */
async function logout(instance) {
  const res = await http.post('/session/logout', null, { headers: instanceHeaders(instance) });
  assertOk(res);
  return unwrap(res.data);
}

/* --------------------------------- /status/* ---------------------------------
 * WhatsApp Status endpoints. Request body for /status/image and /status/video is
 * still best confirmed from the OpenAPI spec — buildStatusPayload (dispatch.service)
 * is the single place to adjust payload fields without touching logic elsewhere.
 */

/** Publish a WhatsApp Status. `type` is one of text|image|video. */
async function sendStatus(instance, type, payload) {
  const res = await http.post(`/status/${type}`, payload, { headers: instanceHeaders(instance) });
  assertOk(res);
  return unwrap(res.data);
}

/** Delete a live status: POST /status/{messageId}/delete. */
async function deleteStatus(instance, messageId) {
  const res = await http.post(`/status/${encodeURIComponent(messageId)}/delete`, null, {
    headers: instanceHeaders(instance),
  });
  assertOk(res);
  return unwrap(res.data);
}

module.exports = {
  createInstance,
  requestPairingCode,
  getSessionStatus,
  logout,
  sendStatus,
  deleteStatus,
};