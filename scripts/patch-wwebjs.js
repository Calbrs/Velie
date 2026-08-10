'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Puppeteer 24 needs a Chrome binary to launch. whatsapp-web.js bundles
// puppeteer, but on fresh hosts (Render, CI) the Chrome download must happen
// explicitly. We install the pinned "chrome" build into the project-local
// `.cache/puppeteer` so it is part of the build output that gets persisted to
// the runtime image (on Render, the default ~/.cache is build-only).
//
// NOTE: we intentionally do NOT use `npx puppeteer browsers install chrome`
// here. @puppeteer/browsers' unpack (extract-zip/yauzl) hangs mid-extraction
// on the Chrome 146 archive and exits 0 leaving a partial install. Our own
// installer downloads + extracts with unzipper instead.
try {
  const root = path.join(__dirname, '..');
  const cacheDir = path.join(root, '.cache', 'puppeteer');
  const puppeteer = require(path.join(root, 'node_modules', 'puppeteer'));
  const executablePath = puppeteer.executablePath();
  process.env.PUPPETEER_CACHE_DIR = cacheDir;
  const { installChrome } = require('./install-chrome');
  installChrome(executablePath, cacheDir)
    .then((p) => console.log('[patch] Chrome installed into', p))
    .catch((err) => console.error('[patch] Chrome install failed (continuing):', err.message));
} catch (err) {
  console.error('[patch] Chrome setup failed (continuing):', err.message);
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
