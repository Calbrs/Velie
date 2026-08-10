'use strict';

const { Router } = require('express');
const sessions = require('../sessions');

const router = Router();

router.get('/pair-code/:phone', async (req, res) => {
  try {
    const result = await sessions.getPairingCode(req.instance, req.params.phone, 60000);
    if (result.connected) return res.json({ connected: true, status: 'connected' });
    return res.json({ pairCode: result.pairCode, expiresAt: result.expiresAt });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

router.get('/status', (req, res) => {
  return res.json(sessions.statusOf(req.instance));
});

router.post('/logout', async (req, res) => {
  try {
    await sessions.logout(req.instance);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
