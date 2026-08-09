'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const WebhookEvent = sequelize.define(
  'WebhookEvent',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    instanceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
    eventType: { type: DataTypes.STRING(40), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: 'webhook_events', underscored: true, updatedAt: false }
);

WebhookEvent.associate = (models) => {
  WebhookEvent.belongsTo(models.WhatsAppInstance, { foreignKey: 'instanceId', as: 'instance' });
};

module.exports = WebhookEvent;