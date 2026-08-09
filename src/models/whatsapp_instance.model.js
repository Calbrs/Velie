'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const WhatsAppInstance = sequelize.define(
  'WhatsAppInstance',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    /** Value of the `X-Instance-Id` header sent to WSAPI. */
    wsapiInstanceId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'wsapi_instance_id',
    },
    /** Value of the `X-Api-Key` header, AES-256 encrypted at rest (VARBINARY). Never exposed to the frontend. */
    wsapiApiKeyEncrypted: {
      type: DataTypes.BLOB,
      allowNull: true,
      defaultValue: null,
      field: 'wsapi_api_key_encrypted',
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
  WhatsAppInstance.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
  WhatsAppInstance.hasMany(models.WebhookEvent, { foreignKey: 'instanceId', as: 'webhookEvents' });
};

module.exports = WhatsAppInstance;