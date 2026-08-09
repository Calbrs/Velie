'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth.middleware');
const { validIntParam } = require('../middleware/validate.middleware');
const instancesController = require('../controllers/instances.controller');

const router = Router();

router.use(authenticate);

router.post('/', instancesController.createOrGet);
router.get('/:id/status', validIntParam('id'), instancesController.getStatus);
router.post('/:id/pairing-code/refresh', validIntParam('id'), instancesController.refreshPairingCode);
router.delete('/:id', validIntParam('id'), instancesController.disconnect);

module.exports = router;