'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { validIntParam } = require('../middleware/validate.middleware');
const { imageUpload } = require('../services/upload.service');
const scheduleController = require('../controllers/schedule.controller');

const router = Router();

router.use(authenticate);

router.post('/', imageUpload.single('image'), scheduleController.create);
router.get('/', scheduleController.list);
router.get('/:id', validIntParam('id'), scheduleController.getOne);
router.put('/:id', validIntParam('id'), imageUpload.single('image'), scheduleController.update);
router.delete('/:id', validIntParam('id'), scheduleController.remove);
router.post('/:id/retry', validIntParam('id'), scheduleController.retry);
router.post('/:id/send-now', validIntParam('id'), scheduleController.sendNow);

module.exports = router;