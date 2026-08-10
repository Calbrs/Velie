'use strict';

const { Router } = require('express');
const sessions = require('../sessions');

const router = Router();

router.post('/:type', async (req, res) => {
  const type = req.params.type;
  if (!['text', 'image', 'video'].includes(type)) {
    return res.status(400).json({ message: 'type must be text|image|video' });
  }
  try {
    const result = await sessions.sendStatus(req.instance, type, req.body || {});
    return res.json({ data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

router.post('/:messageId/delete', async (req, res) => {
  try {
    const result = await sessions.deleteStatus(req.instance, req.params.messageId);
    return res.json({ data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message });
  }
});

module.exports = router;
