'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

let instances = new Map();
let loaded = false;

function ensureFile() {
  if (loaded) return;
  loaded = true;
  if (fs.existsSync(config.storePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(config.storePath, 'utf8'));
      for (const item of Array.isArray(raw) ? raw : []) {
        if (item && item.id) instances.set(item.id, item);
      }
    } catch (err) {
      console.error('[store] failed to read store, starting empty:', err.message);
    }
  }
}

function persist() {
  ensureFile();
  const dir = path.dirname(config.storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${config.storePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...instances.values()], null, 2), 'utf8');
  fs.renameSync(tmp, config.storePath);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function create({ id, apiKey, webhookUrl, signingSecret }) {
  ensureFile();
  if (instances.has(id)) throw Object.assign(new Error('Instance already exists'), { status: 409 });
  const instance = {
    id,
    apiKey: apiKey || null,
    webhookUrl: webhookUrl || null,
    signingSecret: signingSecret || null,
    createdAt: new Date().toISOString(),
  };
  instances.set(id, instance);
  persist();
  return instance;
}

/** Create-or-update (used to rebuild the store from the backend DB on boot). */
function upsert({ id, apiKey, webhookUrl, signingSecret }) {
  ensureFile();
  const existing = instances.get(id) || {};
  const instance = {
    id,
    apiKey: apiKey || existing.apiKey || null,
    webhookUrl: webhookUrl || existing.webhookUrl || null,
    signingSecret: signingSecret || existing.signingSecret || null,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  instances.set(id, instance);
  persist();
  return instance;
}

function get(id) {
  ensureFile();
  return instances.get(id) || null;
}

function getAll() {
  ensureFile();
  return [...instances.values()];
}

function verify(instanceId, apiKey) {
  const instance = get(instanceId);
  if (!instance || !instance.apiKey) return null;
  if (!safeEqual(instance.apiKey, apiKey)) return null;
  return instance;
}

module.exports = { create, upsert, get, getAll, verify };
