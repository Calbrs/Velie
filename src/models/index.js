'use strict';

const { sequelize } = require('../config/db');
const Business = require('./business.model');
const WhatsAppInstance = require('./whatsapp_instance.model');
const MediaAsset = require('./media_asset.model');
const PostSchedule = require('./post_schedule.model');
const WebhookEvent = require('./webhook_event.model');
const Subscription = require('./subscription.model');

const models = {
  Business,
  WhatsAppInstance,
  MediaAsset,
  PostSchedule,
  WebhookEvent,
  Subscription,
};

for (const model of Object.values(models)) {
  if (typeof model.associate === 'function') model.associate(models);
}

models.sequelize = sequelize;

module.exports = models;