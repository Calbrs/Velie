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
const healLogPath = path.join(__dirname, '..', 'data', 'chrome-heal.json');
console.log(`[gateway] PUPPETEER_CACHE_DIR=${process.env.PUPPETEER_CACHE_DIR}`);

function writeHealLog(entry) {
  entry.ts = new Date().toISOString();
  try {
    fs.mkdirSync(path.dirname(healLogPath), { recursive: true });
    fs.writeFileSync(healLogPath, JSON.stringify(entry, null, 2));
  } catch (e) {
    console.error('[gateway] failed to write heal log:', e.message);
  }
}

const chromeReady = (() => {
  let resolve, reject;
  const p = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise: p, resolve, reject };
})();

(async function selfHeal() {
  try {
    const puppeteer = require('puppeteer');
    let chromePath = null;
    let downloadError = null;
    try {
      chromePath = puppeteer.executablePath();
    } catch (e) {
      chromePath = null;
    }
    if (chromePath && fs.existsSync(chromePath)) {
      console.log('[gateway] Chrome present at', chromePath);
      writeHealLog({ ok: true, chromePath, heal: 'none' });
      chromeReady.resolve(true);
      return;
    }
    console.log('[gateway] Chrome missing, installing at runtime...');
    const cacheDir = process.env.PUPPETEER_CACHE_DIR;
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('[gateway] removed stale puppeteer cache', cacheDir);
    } catch (e) {
      console.error('[gateway] could not remove cache dir (continuing):', e.message);
    }
    const started = Date.now();
    try {
      // Use our own installer. @puppeteer/browsers' yauzl-based unpack hangs
      // mid-extraction on the Chrome 146 archive (observed locally and on
      // Render), so we download + extract with unzipper instead.
      const { installChrome } = require('../../../scripts/install-chrome');
      await installChrome(puppeteer.executablePath(), cacheDir, msg => console.log('[gateway]', msg));
    } catch (e) {
      downloadError = String((e && e.stack) || e);
    }
    const ms = Date.now() - started;
    try {
      chromePath = puppeteer.executablePath();
    } catch (e) {
      chromePath = null;
    }
    const ok = !!chromePath && fs.existsSync(chromePath);
    console.log(ok ? `[gateway] Chrome installed at ${chromePath}` : '[gateway] Chrome install finished but binary still missing');
    writeHealLog({ ok, chromePath, heal: 'attempted', ms, downloadError });
    if (ok) chromeReady.resolve(true);
  } catch (err) {
    console.error('[gateway] Chromium self-check failed:', err.message);
    writeHealLog({ ok: false, heal: 'failed', error: err.message });
  }
})().catch(err => {
  console.error('[gateway] Chromium self-check crashed:', err.message);
  writeHealLog({ ok: false, heal: 'crashed', error: String(err && err.stack || err) });
});

function read(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

async function waitForChrome(timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 120000);
  while (Date.now() < deadline) {
    if (fs.existsSync(process.env.PUPPETEER_CACHE_DIR)) return true;
    try {
      const puppeteer = require('puppeteer');
      if (fs.existsSync(puppeteer.executablePath())) return true;
    } catch (err) { /* executablePath may throw */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Chrome not available within timeout');
}

module.exports = {
  port: Number(read('PORT', 4000)),
  // Embedded gateway: accept the backend's WSAPI_ADMIN_KEY when a dedicated
  // ADMIN_KEY isn't set, so a single admin key works for both sides.
  adminKey: read('ADMIN_KEY', read('WSAPI_ADMIN_KEY', '')),
  sessionDir: read('SESSION_DIR', path.join(__dirname, '..', 'data', 'sessions')),
  storePath: read('STORE_PATH', path.join(__dirname, '..', 'data', 'instances.json')),
  chromePath: read('CHROME_PATH', ''),
  chromeReady: chromeReady.promise,
  waitForChrome,
};
