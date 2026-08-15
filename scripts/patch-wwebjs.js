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

// Patch 1: guard the removed canCheckStatusRankingPosterGating helper.
const from1 = 'canCheckStatusRankingPosterGating()';
const to1 = 'canCheckStatusRankingPosterGating\n                        ?.() ?? true';

// Patch 2: LID-era WhatsApp Web changed sendStatusMediaMsgAction from
// positional (msg, mediaUpdate) to a single { mediaMsgData, beforeSend,
// funnelContext } object. whatsapp-web.js still passes positionally, so media
// status posting crashes with "Cannot read properties of undefined (reading
// 'id')" while text statuses (sendStatusTextMsgAction) keep working.
const from2 = `                ](...(isMedia ? [msg, mediaUpdate] : [statusOptions]));`;
const to2 = `                ](
                    ...(isMedia
                        ? [
                              {
                                  mediaMsgData,
                                  beforeSend: async () => {},
                                  funnelContext: undefined,
                              },
                          ]
                        : [statusOptions]),
                );`;

const from2b = `            const mediaUpdate = (data) =>
                window.require('WAWebMediaUpdateMsg')(data, mediaOptions);
            const msg = new (window.require('WAWebCollections').Msg.modelClass)(`;
const to2b = `            const mediaUpdate = (data) =>
                window.require('WAWebMediaUpdateMsg')(data, mediaOptions);
            const mediaMsgData = {
                ...message,
                from: from,
                to: chat.id,
                author: from,
            };
            const msg = new (window.require('WAWebCollections').Msg.modelClass)(`;

let changed = 0;
if (src.includes(to1)) {
  console.log('[patch] canCheckStatusRankingPosterGating already applied');
} else if (src.includes(from1)) {
  const next = src.replace(from1, to1);
  fs.writeFileSync(target, next, 'utf8');
  changed += 1;
  console.log('[patch] applied canCheckStatusRankingPosterGating fix');
} else {
  console.log('[patch] canCheckStatusRankingPosterGating pattern not found, skipping');
}

const patched = fs.readFileSync(target, 'utf8');
if (patched.includes(to2)) {
  console.log('[patch] status media signature already applied');
} else if (patched.includes(from2) && patched.includes(from2b)) {
  let next = patched.replace(from2b, to2b);
  next = next.replace(from2, to2);
  fs.writeFileSync(target, next, 'utf8');
  changed += 1;
  console.log('[patch] applied status media signature fix');
} else {
  console.log('[patch] status media signature pattern not found, skipping');
}

if (changed > 0) console.log('[patch] Utils.js patched');
else console.log('[patch] no changes made');
