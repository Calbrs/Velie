'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SocialAccount = sequelize.define(
  'SocialAccount',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    platform: { type: DataTypes.ENUM('ig', 'fb', 'tiktok', 'x'), allowNull: false },
    accessToken: { type: DataTypes.STRING(255), allowNull: true, defaultValue: null },
    connectedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  { tableName: 'social_accounts', underscored: true }
);

SocialAccount.associate = (models) => {
  SocialAccount.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
};

module.exports = SocialAccount;