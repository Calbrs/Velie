'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Subscription = sequelize.define(
  'Subscription',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    plan: { type: DataTypes.ENUM('free', 'pro', 'business'), allowNull: false },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'annual'),
      allowNull: true,
      defaultValue: null,
    },
    priceAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: null },
    currency: { type: DataTypes.STRING(6), allowNull: false, defaultValue: 'TZS' },
    paymentProvider: { type: DataTypes.STRING(40), allowNull: true, defaultValue: null },
    paymentRef: { type: DataTypes.STRING(120), allowNull: true, defaultValue: null },
    startedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    expiresAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'cancelled'),
      allowNull: false,
      defaultValue: 'active',
    },
  },
  { tableName: 'subscriptions', underscored: true }
);

Subscription.associate = (models) => {
  Subscription.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
};

module.exports = Subscription;