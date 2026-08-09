'use strict';

const { Router } = require('express');
const authRoutes = require('./auth');
const instancesRoutes = require('./instances');
const scheduleRoutes = require('./schedule');
const webhookRoutes = require('./webhook');
const billingRoutes = require('./billing');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

router.use('/auth', authRoutes);
router.use('/admin/instances', instancesRoutes);
router.use('/posts', scheduleRoutes);
router.use('/webhook', webhookRoutes);
router.use('/billing', billingRoutes);

module.exports = router;