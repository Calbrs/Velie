'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null },
    accessToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    plan: { type: DataTypes.ENUM('free', 'pro'), allowNull: false, defaultValue: 'free' },
  },
  { tableName: 'users', underscored: true }
);

User.associate = (models) => {
  User.hasMany(models.WhatsAppInstance, { foreignKey: 'userId', as: 'instances' });
  User.hasMany(models.ScheduledPost, { foreignKey: 'userId', as: 'posts' });
  User.hasMany(models.SocialAccount, { foreignKey: 'userId', as: 'socialAccounts' });
};

module.exports = User;