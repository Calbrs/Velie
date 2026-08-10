'use strict';

const { Router } = require('express');
const store = require('../store');

const router = Router();

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
