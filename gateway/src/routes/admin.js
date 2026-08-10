'use strict';

const { Router } = require('express');
const store = require('../store');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const router = Router();

router.get('/diag', (req, res) => {
  let chromeState = { checked: false };
  try {
    const puppeteer = require('puppeteer');
    const execPath = puppeteer.executablePath();
    chromeState = {
      checked: true,
      executablePath: execPath,
      exists: fs.existsSync(execPath),
      cacheDir: process.env.PUPPETEER_CACHE_DIR || null,
    };
  } catch (err) {
    chromeState = { checked: true, error: err.message, cacheDir: process.env.PUPPETEER_CACHE_DIR || null };
  }
  let heal = null;
  try {
    const healPath = path.join(__dirname, '..', 'data', 'chrome-heal.json');
    if (fs.existsSync(healPath)) heal = JSON.parse(fs.readFileSync(healPath, 'utf8'));
  } catch (err) {
    heal = { readError: err.message };
  }
  let cacheTree = null;
  try {
    const root = process.env.PUPPETEER_CACHE_DIR;
    function walk(dir, depth) {
      if (depth > 3) return ['...'];
      if (!fs.existsSync(dir)) return null;
      return fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
        const full = path.join(dir, e.name);
        const isDir = e.isDirectory();
        let size = null;
        if (!isDir) { try { size = fs.statSync(full).size; } catch (_) {} }
        return isDir ? { name: e.name + '/', children: walk(full, depth + 1) } : { name: e.name, size };
      });
    }
    cacheTree = walk(root, 0);
  } catch (err) {
    cacheTree = { error: err.message };
  }
  let dataDir = null;
  try {
    dataDir = fs.readdirSync(path.join(__dirname, '..', 'data'));
  } catch (err) {
    dataDir = { error: err.message };
  }
  return res.json({
    data: {
      cacheDir: process.env.PUPPETEER_CACHE_DIR || null,
      sessionDir: config.sessionDir,
      storePath: config.storePath,
      chrome: chromeState,
      heal,
      cacheTree,
      dataDir,
      instances: store.getAll().length,
    },
  });
});

router.post('/instances', (req, res) => {
  const { id, apiKey, webhookUrl, signingSecret } = req.body || {};
  if (!id) return res.status(400).json({ message: 'id is required' });
  try {
    const instance = store.create({ id, apiKey, webhookUrl, signingSecret });
    return res.status(201).json({ data: { id: instance.id, ok: true } });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

router.get('/instances', (req, res) => {
  const list = store.getAll().map(({ id, createdAt }) => ({ id, createdAt }));
  return res.json({ data: list });
});

module.exports = router;
