'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { imageUpload } = require('../services/upload.service');
const videoController = require('../controllers/video.controller');

const router = Router();

// Upload a raw asset (source video / watermark / background music) → public URL.
router.post('/asset', authenticate, imageUpload.single('file'), videoController.uploadAsset);

// Submit a composition for local ffmpeg rendering; returns { job_id }.
router.post('/render', authenticate, videoController.createRender);

// Poll the render job (the app polls every ~5s until completed/failed).
router.get('/render/status', authenticate, videoController.getStatus);

module.exports = router;