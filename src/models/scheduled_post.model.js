'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ScheduledPost = sequelize.define(
  'ScheduledPost',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    instanceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
    /** Media type of the post (picha pekee kwa sasa; video Phase 2). */
    type: {
      type: DataTypes.ENUM('image'),
      allowNull: false,
      defaultValue: 'image',
    },
    /** Which WhatsApp surface the post targets. */
    channel: {
      type: DataTypes.ENUM('wa_status', 'wa_group'),
      allowNull: false,
      defaultValue: 'wa_status',
    },
    groupId: { type: DataTypes.STRING(64), allowNull: true, defaultValue: null },
    content: { type: DataTypes.TEXT, allowNull: false },
    mediaUrl: { type: DataTypes.STRING(255), allowNull: false },
    scheduledAt: { type: DataTypes.DATE, allowNull: false },
    timezone: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'Africa/Dar_es_Salaam',
    },
    status: {
      type: DataTypes.ENUM('pending', 'published', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    error: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    publishedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  { tableName: 'scheduled_posts', underscored: true }
);

ScheduledPost.associate = (models) => {
  ScheduledPost.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  ScheduledPost.belongsTo(models.WhatsAppInstance, { foreignKey: 'instanceId', as: 'instance' });
};

module.exports = ScheduledPost;