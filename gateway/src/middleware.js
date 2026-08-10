'use strict';

const crypto = require('crypto');
const config = require('./config');
const store = require('./store');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  if (!config.adminKey || !safeEqual(config.adminKey, req.headers['x-api-key'])) {
    return res.status(401).json({ message: 'Invalid admin key' });
  }
  return next();
}

function requireInstance(req, res, next) {
  const instance = store.verify(req.headers['x-instance-id'], req.headers['x-api-key']);
  if (!instance) return res.status(401).json({ message: 'Invalid instance credentials' });
  req.instance = instance;
  return next();
}

module.exports = { requireAdmin, requireInstance };
