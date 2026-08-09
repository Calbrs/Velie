'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Business = sequelize.define(
  'Business',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessName: { type: DataTypes.STRING(120), allowNull: false },
    ownerPhone: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    accessToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    plan: {
      type: DataTypes.ENUM('free', 'pro', 'business'),
      allowNull: false,
      defaultValue: 'free',
    },
  },
  { tableName: 'businesses', underscored: true }
);

Business.associate = (models) => {
  Business.hasOne(models.WhatsAppInstance, { foreignKey: 'businessId', as: 'instance' });
  Business.hasMany(models.MediaAsset, { foreignKey: 'businessId', as: 'mediaAssets' });
  Business.hasMany(models.PostSchedule, { foreignKey: 'businessId', as: 'posts' });
  Business.hasMany(models.Subscription, { foreignKey: 'businessId', as: 'subscriptions' });
};

module.exports = Business;