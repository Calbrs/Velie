'use strict';

const crypto = require('crypto');
const config = require('../config/env');

const ALGO = 'aes-256-gcm';

function keyBytes() {
  const secret = config.encryptionKey;
  if (!secret) throw new Error('ENCRYPTION_KEY haipo kwenye env');
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex');
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext secret (the per-instance WSAPI `X-Api-Key`) with AES-256-GCM.
 * Returns "<ivHex>:<authTagHex>:<ciphertextHex>".
 */
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt(). Accepts a string or a Buffer (as read
 * from the VARBINARY column). Returns plaintext or null.
 */
function decrypt(payload) {
  if (payload === undefined || payload === null || payload === '') return null;
  const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload);
  const [ivHex, tagHex, dataHex] = text.split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  const decipher = crypto.createDecipheriv(ALGO, keyBytes(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };