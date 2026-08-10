'use strict';

const { Router } = require('express');
const store = require('../store');
const config = require('../config');
const fs = require('fs');

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
  return res.json({
    data: {
      cacheDir: process.env.PUPPETEER_CACHE_DIR || null,
      sessionDir: config.sessionDir,
      storePath: config.storePath,
      chrome: chromeState,
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
