'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const WhatsAppInstance = sequelize.define(
  'WhatsAppInstance',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    /** The identity/ID given by WSAPI for this exact WhatsApp account (e.g. `inst_abc123`). */
    wsapiInstanceId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'wsapi_instance_id',
    },
    /** Per-instance WSAPI API key — stored ENCRYPTED (AES-256-GCM), never exposed to the frontend. */
    wsapiApiKey: {
      type: DataTypes.STRING(512),
      allowNull: true,
      defaultValue: null,
      field: 'wsapi_api_key',
    },
    status: {
      type: DataTypes.ENUM('disconnected', 'pending', 'connected'),
      allowNull: false,
      defaultValue: 'disconnected',
    },
    pairingCode: { type: DataTypes.STRING(16), allowNull: true, defaultValue: null },
    pairingCodeExpiresAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    connectedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  { tableName: 'whatsapp_instances', underscored: true }
);

WhatsAppInstance.associate = (models) => {
  WhatsAppInstance.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  WhatsAppInstance.hasMany(models.WebhookEvent, { foreignKey: 'instanceId', as: 'webhookEvents' });
  WhatsAppInstance.hasMany(models.ScheduledPost, { foreignKey: 'instanceId', as: 'posts' });
};

module.exports = WhatsAppInstance;