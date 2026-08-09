'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const WhatsAppInstance = sequelize.define(
  'WhatsAppInstance',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    instanceKey: { type: DataTypes.STRING(64), allowNull: false, unique: true },
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