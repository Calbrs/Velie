'use strict';

const crypto = require('crypto');
const config = require('../config/env');

const ALGO = 'aes-256-gcm';

function keyBytes() {
  const secret = config.wsapi.encryptionKey;
  if (!secret) throw new Error('WSAPI_KEY_ENCRYPTION_KEY haipo kwenye env');
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext secret (e.g. per-instance WSAPI API key) with AES-256-GCM.
 * Format: "<ivHex>:<authTagHex>:<ciphertextHex>". Never return the plaintext to the frontend.
 */
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  const decipher = crypto.createDecipheriv(ALGO, keyBytes(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };