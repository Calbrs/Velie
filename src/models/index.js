'use strict';

const { sequelize } = require('../config/db');
const User = require('./user.model');
const WhatsAppInstance = require('./whatsapp_instance.model');
const ScheduledPost = require('./scheduled_post.model');
const WebhookEvent = require('./webhook_event.model');
const SocialAccount = require('./social_account.model');

const models = {
  User,
  WhatsAppInstance,
  ScheduledPost,
  WebhookEvent,
  SocialAccount,
};

for (const model of Object.values(models)) {
  if (typeof model.associate === 'function') model.associate(models);
}

models.sequelize = sequelize;

module.exports = models;