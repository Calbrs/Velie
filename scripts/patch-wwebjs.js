'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Puppeteer 24 needs a Chrome binary to launch. whatsapp-web.js bundles
// puppeteer, but on fresh hosts (Render, CI) the Chrome download must happen
// explicitly. We install the pinned "chrome" build into the project-local
// `.cache/puppeteer` so it is part of the build output that gets persisted to
// the runtime image (on Render, the default ~/.cache is build-only).
try {
  const root = path.join(__dirname, '..');
  const cacheDir = path.join(root, '.cache', 'puppeteer');
  process.env.PUPPETEER_CACHE_DIR = cacheDir;
  execSync('npx puppeteer browsers install chrome', {
    cwd: root,
    stdio: 'inherit',
    timeout: 600000,
    env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir },
  });
  console.log('[patch] Chrome installed into', cacheDir);
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
