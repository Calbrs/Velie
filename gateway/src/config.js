'use strict';

const path = require('path');
require('dotenv').config();

function read(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

module.exports = {
  port: Number(read('PORT', 4000)),
  // Embedded gateway: accept the backend's WSAPI_ADMIN_KEY when a dedicated
  // ADMIN_KEY isn't set, so a single admin key works for both sides.
  adminKey: read('ADMIN_KEY', read('WSAPI_ADMIN_KEY', '')),
  sessionDir: read('SESSION_DIR', path.join(__dirname, '..', 'data', 'sessions')),
  storePath: read('STORE_PATH', path.join(__dirname, '..', 'data', 'instances.json')),
  chromePath: read('CHROME_PATH', ''),
};
