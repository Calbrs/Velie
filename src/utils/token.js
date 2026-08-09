'use strict';

const crypto = require('crypto');

function generateAccessToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('hex');
}

function randomBytes(prefix, byteLength = 8) {
  return `${prefix}_${crypto.randomBytes(byteLength).toString('hex')}`;
}

module.exports = { generateAccessToken, randomBytes };