'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { requireFields } = require('../middleware/validate.middleware');

const router = Router();

router.post(
  '/register',
  requireFields(['business_name', 'owner_phone']),
  authController.register
);

module.exports = router;