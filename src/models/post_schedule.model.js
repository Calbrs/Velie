'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PostSchedule = sequelize.define(
  'PostSchedule',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    /** NULL for text posts. */
    mediaAssetId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
    type: {
      type: DataTypes.ENUM('text', 'image', 'video'),
      allowNull: false,
      defaultValue: 'image',
    },
    content: { type: DataTypes.TEXT, allowNull: false },
    scheduledTime: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'deleted'),
      allowNull: false,
      defaultValue: 'pending',
    },
    /** ID returned by WSAPI after posting — used for DELETE /status/{id}. */
    wsapiStatusId: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
    retries: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    lastError: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    publishedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  { tableName: 'posts_schedule', underscored: true }
);

PostSchedule.associate = (models) => {
  PostSchedule.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
  PostSchedule.belongsTo(models.MediaAsset, { foreignKey: 'mediaAssetId', as: 'mediaAsset' });
};

module.exports = PostSchedule;