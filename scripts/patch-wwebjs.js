'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Puppeteer 24 needs a Chrome binary to launch. On fresh hosts (Render, CI)
// `npm install` runs puppeteer's postinstall, but to be safe we install the
// pinned "chrome" build explicitly into the default (or configured) cache.
try {
  const root = path.join(__dirname, '..');
  execSync('npx puppeteer browsers install chrome', {
    cwd: root,
    stdio: 'inherit',
    timeout: 600000,
  });
  console.log('[patch] Chrome installed via puppeteer');
} catch (err) {
  console.error('[patch] Chrome install failed (continuing):', err.message);
}

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'whatsapp-web.js',
  'src',
  'util',
  'Injected',
  'Utils.js'
);

if (!fs.existsSync(target)) {
  console.log('[patch] whatsapp-web.js Utils.js not found, skipping');
  process.exit(0);
}

const src = fs.readFileSync(target, 'utf8');
const from = 'canCheckStatusRankingPosterGating()';
const to = 'canCheckStatusRankingPosterGating\n                        ?.() ?? true';

if (src.includes(to)) {
  console.log('[patch] already applied');
} else if (src.includes(from)) {
  fs.writeFileSync(target, src.replace(from, to), 'utf8');
  console.log('[patch] applied canCheckStatusRankingPosterGating fix');
} else {
  console.log('[patch] pattern not found, skipping');
}
