'use strict';

const path = require('path');
require('dotenv').config();

// Reach Chrome from the project-local cache. Render pre-sets
// PUPPETEER_CACHE_DIR to a build-only default (/opt/render/.cache/puppeteer)
// that is absent at runtime, so we force it to the project cache before
// puppeteer launches. The project dir is writable at runtime, so we also
// self-heal: if the Chrome cache for the installed puppeteer revision is
// missing, download it now (the build-time install does not always survive
// Render's runtime image).
const fs = require('fs');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'puppeteer');
console.log(`[gateway] PUPPETEER_CACHE_DIR=${process.env.PUPPETEER_CACHE_DIR}`);

try {
  const puppeteer = require('puppeteer');
  const chromePath = puppeteer.executablePath();
  if (fs.existsSync(chromePath)) {
    console.log('[gateway] Chrome present at', chromePath);
  } else {
    console.log('[gateway] Chrome missing at', chromePath, '- installing at runtime...');
    const { execSync } = require('child_process');
    execSync('npx puppeteer browsers install chrome', {
      cwd: path.join(__dirname, '..', '..'),
      stdio: 'inherit',
      timeout: 600000,
    });
    fs.existsSync(chromePath)
      ? console.log('[gateway] Chrome installed at', chromePath)
      : console.error('[gateway] Chrome install finished but binary still missing at', chromePath);
  }
} catch (err) {
  console.error('[gateway] Chromium self-check skipped:', err.message);
}

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
