'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PostSchedule = sequelize.define(
  'PostSchedule',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    imageUrl: { type: DataTypes.STRING(255), allowNull: false },
    caption: { type: DataTypes.TEXT, allowNull: false },
    channel: {
      type: DataTypes.ENUM('wa_status', 'wa_group', 'ig', 'fb', 'tiktok'),
      allowNull: false,
    },
    groupId: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
    scheduledTime: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    retries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastError: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
  },
  { tableName: 'posts_schedule', underscored: true }
);

PostSchedule.associate = (models) => {
  PostSchedule.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
};

module.exports = PostSchedule;