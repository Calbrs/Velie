'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');

const SIGNATURE_HEADER = 'x-webhook-signature';

function sign(raw, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
}

function fire(instance, eventType, data) {
  if (!instance || !instance.webhookUrl) return;
  const payload = { eventType, instanceId: instance.id, data, ts: new Date().toISOString() };
  const raw = JSON.stringify(payload);
  const secret = instance.signingSecret || '';

  let url;
  try {
    url = new URL(instance.webhookUrl);
  } catch (err) {
    console.error(`[webhook] invalid webhook url for ${instance.id}:`, err.message);
    return;
  }

  const lib = url.protocol === 'https:' ? https : http;
  const headers = {
    'content-type': 'application/json',
    [SIGNATURE_HEADER]: sign(raw, secret),
    'content-length': Buffer.byteLength(raw),
  };

  const req = lib.request(url, { method: 'POST', headers, timeout: 15000 });
  req.on('error', (err) => {
    console.error(`[webhook] ${eventType} -> ${instance.id} failed: ${err.message}`);
  });
  req.on('timeout', () => {
    req.destroy(new Error('webhook timeout'));
  });
  req.write(raw);
  req.end();
}

module.exports = { fire, sign };
