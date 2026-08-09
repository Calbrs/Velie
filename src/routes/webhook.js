'use strict';

const { Router } = require('express');
const webhookController = require('../controllers/webhook.controller');

const router = Router();

router.post('/wsapi', webhookController.handleWebhook);

module.exports = router;