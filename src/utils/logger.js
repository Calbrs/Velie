'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = process.env.NODE_ENV === 'production' ? LEVELS.warn : LEVELS.debug;

function stamp() {
  return new Date().toISOString();
}

function format(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.stack || a.message}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch (_) {
        return String(a);
      }
    })
    .join(' ');
}

function write(level, args) {
  if (LEVELS[level] < threshold) return;
  if (level === 'error') process.stderr.write(`[${stamp()}] ${level.toUpperCase()} ${format(args)}\n`);
  else process.stdout.write(`[${stamp()}] ${level.toUpperCase()} ${format(args)}\n`);
}

const logger = {};
for (const level of Object.keys(LEVELS)) {
  logger[level] = (...args) => write(level, args);
}

module.exports = logger;