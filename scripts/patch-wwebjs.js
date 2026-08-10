'use strict';

const fs = require('fs');
const path = require('path');

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
