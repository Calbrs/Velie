'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { validIntParam } = require('../middleware/validate.middleware');
const billingController = require('../controllers/billing.controller');

const router = Router();

router.post('/subscribe', authenticate, billingController.subscribe);
router.get('/subscription', authenticate, billingController.getSubscription);
router.post('/webhook', billingController.billingWebhook);

module.exports = router;