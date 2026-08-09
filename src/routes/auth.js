'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { requireFields } = require('../middleware/validate.middleware');

const router = Router();

router.post(
  '/register',
  requireFields(['name', 'email']),
  authController.register
);

module.exports = router;