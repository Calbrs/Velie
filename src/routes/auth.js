'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { requireFields } = require('../middleware/validate.middleware');

const router = Router();

router.post(
  '/register',
  requireFields(['name', 'owner_phone', 'password']),
  authController.register
);

router.post(
  '/login',
  requireFields(['owner_phone', 'password']),
  authController.login
);

module.exports = router;
