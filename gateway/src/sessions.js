'use strict';

// Load config FIRST so it can set PUPPETEER_CACHE_DIR and self-heal the Chrome
// install before whatsapp-web.js/puppeteer is imported. If the env var is set
// after puppeteer loads its configuration, puppeteer may have already captured
// the default (Render's build-only) cache directory.
const config = require('./config');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
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

function buildRevokePayload(message, revokedMsg) {
  const d = message._data || {};
  // The message passed to message_revoke_everyone lacks the original body; the
  // second argument (when captured) holds the pre-revoke state.
  const r = revokedMsg && revokedMsg._data ? revokedMsg._data : {};
  return {
    messageId: (message.id && message.id.id) || d.id || null,
    from: d.from || null,
    fromMe: !!(d.fromMe || (message.fromMe === true)),
    body: r.body || '',
    type: r.type || d.type || null,
    timestamp: d.timestamp || null,
    isStatus: (d.from === 'status@broadcast') || (r.chatId === 'status@broadcast'),
  };
}

function makeClient(instance) {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: instance.id, dataPath: config.sessionDir }),
    puppeteer: {
      headless: true,
      ...(config.chromePath ? { executablePath: config.chromePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--no-zygote',
        ...(config.lowMemory ? [
          // Low-memory guidance for 1GB Always Free instances. --single-process
          // collapses Chromium's per-process overhead into one process (much
          // lower RSS); not ideal for production but needed on small boxes.
          '--single-process',
          '--js-flags=--max-old-space-size=256',
          '--disable-extensions',
          '--no-first-run',
          '--no-default-browser-check',
        ] : []),
      ],
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
    watchdogTimer: null,
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
    startWatchdog(meta);
    if (meta.reconnectTimer) {
      clearTimeout(meta.reconnectTimer);
      meta.reconnectTimer = null;
    }
    console.log(`[session] ${instance.id} connected`);
    webhook.fire(instance, 'logged_in', {});
  });

  client.on('auth_failure', (message) => {
    meta.lastError = message;
    stopWatchdog(meta);
    webhook.fire(instance, 'login_error', { message: String(message) });
  });

  client.on('disconnected', (reason) => {
    meta.ready = false;
    meta.qr = null;
    stopWatchdog(meta);
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

  client.on('message_revoke_everyone', (message, revokedMsg) => {
    webhook.fire(instance, 'message_revoked', buildRevokePayload(message, revokedMsg));
  });

  return meta;
}

async function start(instance, phone) {
  // Ensure Chrome is available (self-heal may still be downloading at boot)
  // before launching whatsapp-web.js, otherwise initialization fails fast.
  await config.waitForChrome(120000).catch(() => { /* resent; surface later */ });
  let meta = sessions.get(instance.id);
  if (!meta) {
    meta = makeClient(instance);
    sessions.set(instance.id, meta);
  }
  meta.phone = phone || meta.phone || null;
  if (meta.ready || meta.initializing) return meta;
  meta.initializing = true;
  console.log(`[session] ${instance.id} launching (rss=${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB)`);
  meta.client.initialize().catch((err) => {
    meta.initializing = false;
    meta.lastError = err && err.message;
  });
  return meta;
}

// WhatsApp Web's in-page socket reports disconnects (WAState), but that event
// never fires when the Chromium PROCESS itself is killed (e.g. OOM on a 1GB
// box) — the meta stays `ready: true` and every evaluate() hits a detached
// frame ("Attempted to use detached Frame"). Probe the page periodically and
// recreate the session if the frame is unusable, so sends recover automatically.
function startWatchdog(meta) {
  if (meta.watchdogTimer) return;
  meta.watchdogTimer = setInterval(async () => {
    if (!meta.ready) return;
    const page = meta.client && meta.client.pupPage;
    if (!page) return;
    // A detached frame still reports the *page* alive but evaluate() throws.
    // Guard the probe itself in case the page is mid-navigation.
    let ok = false;
    try {
      await page.evaluate(() => 1);
      ok = true;
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      console.log(`[session] ${meta.instance.id} browser page unusable, recreating (rss=${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB)`);
      recreate(meta.instance);
    }
  }, 15000);
}

function stopWatchdog(meta) {
  if (meta.watchdogTimer) {
    clearInterval(meta.watchdogTimer);
    meta.watchdogTimer = null;
  }
}

function recreate(instance) {
  const old = sessions.get(instance.id);
  if (old && old.client) {
    stopWatchdog(old);
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

async function waitForPage(meta, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (meta.client.pupPage) return;
    if (meta.lastError) {
      throw statusError('Browser failed to launch: ' + meta.lastError, 502);
    }
    await sleep(300);
  }
  throw statusError('WhatsApp page did not initialize', 502);
}

async function getPairingQr(instance, timeoutMs) {
  const meta = await start(instance);
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
  const meta = await start(instance, phone);
  if (meta.ready) return { connected: true };

  if (typeof meta.client.requestPairingCode !== 'function') {
    return getPairingQr(instance, 20000);
  }

  meta.lastError = null;

  const digits = String(meta.phone || '').replace(/[^0-9]/g, '');
  if (!digits) throw statusError('phone is required (E.164)', 400);

  await waitForPage(meta, 90000);

  // requestPairingCode needs WhatsApp Web's linking UI ready AND the socket in a
  // linking state (UNPAIRED/UNPAIRED_IDLE); it throws a cryptic error otherwise.
  // Poll until then, bailing early if a stored session restores and connects.
  const page = meta.client.pupPage;
  const deadline = Date.now() + Math.min(Number(timeoutMs) || 30000, 60000);
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

  meta.lastError = null;

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
  const meta = await start(instance);
  if (!meta.ready) {
    // A cold start (or recovery after Chrome died) needs to restore the saved
    // WhatsApp session before we can send. Wait here so the caller doesn't get
    // a hard 409 mid-restore.
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (meta.ready) break;
      if (meta.lastError) break;
      await sleep(300);
    }
    if (!meta.ready) {
      throw statusError('WhatsApp instance is not connected', 409);
    }
  }
  const p = payload || {};

  try {
    return await doSend(meta, type, p);
  } catch (err) {
    // Detached frame = the Chromium page was reloaded/killed under us while the
    // gateway still thought we were ready. Recreate the session once and retry
    // rather than surfacing a confusing 500.
    const msg = err && err.message;
    if (msg && /detached Frame/i.test(String(msg))) {
      console.log(`[session] ${instance.id} send hit detached frame, recreating and retrying`);
      recreate(instance);
      const retry = await start(instance, null);
      // A recreated session needs to become ready again.
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline && !retry.ready) await sleep(300);
      if (retry.ready) return doSend(retry, type, p);
    }
    throw err;
  }
}

async function doSend(meta, type, payload) {
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

/**
 * Best-effort reader for the list of WhatsApp contacts who viewed one of our
 * status posts. whatsapp-web.js has no public API for this, so we dig into the
 * WhatsApp Web page's internal modules:
 *   - `WAWebCollections.Seen` holds per-message "seenBy" WID lists for status
 *     messages (messageId here is the short stanza id from a successful send).
 *   - `WAWebCollections.Status.getMyStatus()` models also carry viewer info via
 *     `seenBy` on their msgs.
 * Returns { viewers: [...] } or { viewers: [], error } — never throws so callers
 * can treat missing viewer data as "not yet available".
 */
async function getStatusViewers(instance, messageId) {
  const meta = sessions.get(instance.id);
  if (!meta || !meta.ready) throw statusError('WhatsApp instance is not connected', 409);
  const page = meta.client && meta.client.pupPage;
  if (!page) throw statusError('WhatsApp page not available', 409);

  try {
    const result = await page.evaluate(async (stanzaId) => {
      const collections = window.require('WAWebCollections');
      const collector = { read: [] };

      // We know the short stanza id the send returned (e.g. 3EB0EB35...).
      // The Status collection keeps my own status messages; match by the message
      // id, the serialized id, or as a fallback the most recent fromMe status.
      const getCandidates = () => {
        const out = [];
        const all = collections.Status && collections.Status.getModelsArray
          ? collections.Status.getModelsArray()
          : [];
        for (const s of all) {
          const arr = (s && (s.statusMsgs && (s.statusMsgs.models || s.statusMsgs))) || [];
          for (const m of arr) {
            if (m && m.id && m.id.fromMe) out.push(m);
          }
        }
        return out;
      };

      let target = null;
      for (const m of getCandidates()) {
        const d = m.id;
        const short = d.id;
        const serialized = d._serialized;
        if (short === stanzaId || serialized === stanzaId || (serialized && serialized.startsWith(stanzaId))) {
          target = m;
          break;
        }
      }
      if (!target && getCandidates().length) {
        // Fall back to the most recent of my status messages.
        target = getCandidates().sort((a, b) => (b.t || 0) - (a.t || 0))[0];
      }

      if (!target) {
        return { viewers: [], error: 'My status message not found in page' };
      }

      try {
        const info = await window.require('WAWebApiMessageInfoStore').queryMsgInfo(target.id);
        const read = (info && (Array.isArray(info.read) ? info.read : (info.read ? info.read.models || info.read : []))) || [];
        collector.read = read
          .map((r) => {
            const id = r && (r.id && (r.id._serialized || r.id.user || r.id.id)) || r;
            return String(id);
          })
          .filter(Boolean);
        return { viewers: collector.read };
      } catch (e) {
        return { viewers: [], error: 'queryMsgInfo failed: ' + e.message };
      }
    }, messageId);

    return {
      viewers: result.viewers || [],
      error: result.error || null,
    };
  } catch (err) {
    if (err && /detached Frame/i.test(String(err.message))) {
      recreate(instance);
    }
    return { viewers: [], error: err && err.message };
  }
}

async function logout(instance) {
  const meta = sessions.get(instance.id);
  if (meta && meta.ready) {
    try {
      stopWatchdog(meta);
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

module.exports = { start, getPairingCode, getPairingQr, statusOf, sendStatus, deleteStatus, getStatusViewers, logout };
