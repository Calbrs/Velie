'use strict';

const { Router } = require('express');
const authRoutes = require('./auth');
const instancesRoutes = require('./instances');
const scheduleRoutes = require('./schedule');
const webhookRoutes = require('./webhook');
const billingRoutes = require('./billing');
const videoRoutes = require('./video');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

router.use('/auth', authRoutes);
router.use('/admin/instances', instancesRoutes);
router.use('/posts', scheduleRoutes);
router.use('/webhook', webhookRoutes);
router.use('/billing', billingRoutes);
router.use('/v1/video', videoRoutes);

module.exports = router;