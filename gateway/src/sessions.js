'use strict';

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const config = require('./config');
const webhook = require('./webhook');

const sessions = new Map();
const PERMANENT_REASONS = ['LOGOUT', 'UNPAIRED_DEVICE', 'REMOVED_DEVICE', 'DELETE_ACCOUNT'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function buildMessagePayload(msg) {
  const d = msg._data || {};
  const qMsg = d.quotedMsg || null;
  let quotedMessageId = null;
  if (qMsg && qMsg.id) {
    quotedMessageId = qMsg.id.id
      || (typeof qMsg.id._serialized === 'string' ? qMsg.id._serialized : null);
  }
  quotedMessageId = quotedMessageId || d.quotedStanzaID || null;

  let quotedRemote = null;
  if (qMsg && qMsg.id && qMsg.id.remote) {
    quotedRemote = typeof qMsg.id.remote._serialized === 'string'
      ? qMsg.id.remote._serialized
      : String(qMsg.id.remote);
  }
  quotedRemote = quotedRemote || d.quotedRemoteJid || null;

  return {
    messageId: (msg.id && msg.id.id) || d.id || null,
    from: msg.from || null,
    fromMe: !!msg.fromMe,
    body: msg.body || d.body || '',
    type: d.type || null,
    timestamp: d.timestamp || null,
    hasQuote: !!msg.hasQuotedMsg,
    quotedMessageId,
    quotedRemote,
    quotedParticipant: d.quotedParticipant || null,
    isStatus: msg.from === 'status@broadcast',
  };
}

function makeClient(instance) {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: instance.id, dataPath: config.sessionDir }),
    puppeteer: {
      headless: true,
      ...(config.chromePath ? { executablePath: config.chromePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    },
  });

  const meta = {
    instance,
    client,
    initializing: false,
    ready: false,
    qr: null,
    qrAt: 0,
    lastError: null,
    reconnectTimer: null,
  };

  client.on('qr', (qr) => {
    meta.qr = qr;
    meta.qrAt = Date.now();
  });

  client.on('ready', () => {
    meta.ready = true;
    meta.initializing = false;
    meta.qr = null;
    meta.lastError = null;
    if (meta.reconnectTimer) {
      clearTimeout(meta.reconnectTimer);
      meta.reconnectTimer = null;
    }
    console.log(`[session] ${instance.id} connected`);
    webhook.fire(instance, 'logged_in', {});
  });

  client.on('auth_failure', (message) => {
    meta.lastError = message;
    webhook.fire(instance, 'login_error', { message: String(message) });
  });

  client.on('disconnected', (reason) => {
    meta.ready = false;
    meta.qr = null;
    console.log(`[session] ${instance.id} disconnected: ${reason}`);
    if (PERMANENT_REASONS.includes(reason)) {
      webhook.fire(instance, 'logged_out', { reason });
      return;
    }
    if (meta.reconnectTimer) clearTimeout(meta.reconnectTimer);
    meta.reconnectTimer = setTimeout(() => {
      if (sessions.get(instance.id) === meta) recreate(instance);
    }, 10000);
  });

  client.on('message', (msg) => {
    webhook.fire(instance, 'message', buildMessagePayload(msg));
  });

  return meta;
}

function start(instance, phone) {
  let meta = sessions.get(instance.id);
  if (!meta) {
    meta = makeClient(instance);
    sessions.set(instance.id, meta);
  }
  meta.phone = phone || meta.phone || null;
  if (meta.ready || meta.initializing) return meta;
  meta.initializing = true;
  meta.client.initialize().catch((err) => {
    meta.initializing = false;
    meta.lastError = err && err.message;
  });
  return meta;
}

function recreate(instance) {
  const old = sessions.get(instance.id);
  if (old && old.client) {
    try {
      old.client.destroy();
    } catch (err) {
      /* ignore */
    }
  }
  const meta = makeClient(instance);
  sessions.set(instance.id, meta);
  if (old) meta.phone = old.phone || null;
  meta.initializing = true;
  meta.client.initialize().catch((err) => {
    meta.initializing = false;
    meta.lastError = err && err.message;
  });
  return meta;
}

async function waitForPage(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (client.pupPage) return;
    await sleep(300);
  }
  throw statusError('WhatsApp page did not initialize', 502);
}

async function getPairingQr(instance, timeoutMs) {
  const meta = start(instance);
  if (meta.ready) return { connected: true };
  meta.qr = null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (meta.ready) return { connected: true };
    if (meta.qr) {
      const dataUrl = await QRCode.toDataURL(meta.qr, { width: 280, margin: 1 });
      return {
        pairCode: dataUrl,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      };
    }
    await sleep(300);
  }
  throw statusError('No QR code available within timeout', 502);
}

/**
 * Pair via WhatsApp's "link with a phone number" code (what the Velie app uses).
 * The code is 8 chars and is entered on the phone under Linked Devices.
 */
async function getPairingCode(instance, phone, timeoutMs) {
  const meta = start(instance, phone);
  if (meta.ready) return { connected: true };

  if (typeof meta.client.requestPairingCode !== 'function') {
    return getPairingQr(instance, 20000);
  }

  const digits = String(meta.phone || '').replace(/[^0-9]/g, '');
  if (!digits) throw statusError('phone is required (E.164)', 400);

  await waitForPage(meta.client, 15000);

  // requestPairingCode needs WhatsApp Web's linking UI ready AND the socket in a
  // linking state (UNPAIRED/UNPAIRED_IDLE); it throws a cryptic error otherwise.
  // Poll until then, bailing early if a stored session restores and connects.
  const page = meta.client.pupPage;
  const deadline = Date.now() + Math.min(Number(timeoutMs) || 30000, 30000);
  let uiReady = false;
  while (Date.now() < deadline) {
    if (meta.ready) return { connected: true };
    try {
      uiReady = await page.evaluate(() => {
        let sock = '';
        try { sock = window.require('WAWebSocketModel').Socket.state; } catch (e) { /* ignore */ }
        return !!(window.AuthStore && window.AuthStore.PairingCodeLinkUtils
          && (sock === 'UNPAIRED' || sock === 'UNPAIRED_IDLE'));
      });
    } catch (err) {
      uiReady = false;
    }
    if (uiReady) break;
    await sleep(1000);
  }
  if (meta.ready) return { connected: true };
  if (!uiReady) throw statusError('WhatsApp pairing UI did not become ready', 502);

  const code = await meta.client.requestPairingCode(digits, false, 60000);
  if (!code) throw statusError('No pairing code returned', 502);

  return {
    pairCode: String(code),
    expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
  };
}

function statusOf(instance) {
  const meta = sessions.get(instance.id);
  if (!meta) return { status: 'disconnected', qrPending: false, lastError: null };
  return {
    status: meta.ready ? 'connected' : meta.qr ? 'pending' : 'disconnected',
    qrPending: !meta.ready && !!meta.qr,
    lastError: meta.lastError,
  };
}

async function sendStatus(instance, type, payload) {
  const meta = start(instance);
  if (!meta.ready) throw statusError('WhatsApp instance is not connected', 409);
  const p = payload || {};
  let messageId;

  if (type === 'text') {
    if (!p.text) throw statusError('text is required', 400);
    const msg = await meta.client.sendMessage('status@broadcast', String(p.text), {
      ...(p.backgroundColor ? { backgroundColor: p.backgroundColor } : {}),
      ...(p.font !== undefined ? { fontStyle: Number(p.font) } : {}),
    });
    messageId = msg.id && msg.id.id;
  } else {
    if (!p.data) throw statusError('data (base64) is required', 400);
    const mimeType = p.mimeType || (type === 'image' ? 'image/jpeg' : 'video/mp4');
    const ext = String(mimeType).split('/')[1] || 'bin';
    const media = new MessageMedia(mimeType, p.data, `status.${ext}`);
    const msg = await meta.client.sendMessage('status@broadcast', media, {
      ...(p.caption ? { caption: p.caption } : {}),
    });
    messageId = msg.id && msg.id.id;
  }

  if (!messageId) throw statusError('Send did not return a message id', 500);
  return { statusId: messageId, messageId, type };
}

async function deleteStatus(instance, messageId) {
  const meta = sessions.get(instance.id);
  if (!meta || !meta.ready) throw statusError('WhatsApp instance is not connected', 409);
  await meta.client.revokeStatusMessage(messageId);
  return { deleted: true, messageId };
}

async function logout(instance) {
  const meta = sessions.get(instance.id);
  if (meta && meta.ready) {
    try {
      await meta.client.logout();
    } catch (err) {
      /* ignore */
    }
  }
  if (meta && meta.reconnectTimer) clearTimeout(meta.reconnectTimer);
  if (meta) {
    meta.ready = false;
    meta.qr = null;
  }
  return { ok: true };
}

module.exports = { start, getPairingCode, getPairingQr, statusOf, sendStatus, deleteStatus, logout };
