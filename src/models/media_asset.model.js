'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Hybrid-storage asset: a temporary copy of an uploaded image kept only while
 * the platform needs it (until all related posts finish + 24h retention window).
 */
const MediaAsset = sequelize.define(
  'MediaAsset',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    storagePath: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(60), allowNull: false },
    sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    /** Extended forward every time a new post uses this asset; NULL = awaiting first job. */
    expiresAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  { tableName: 'media_assets', underscored: true }
);

MediaAsset.associate = (models) => {
  MediaAsset.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
  MediaAsset.hasMany(models.PostSchedule, { foreignKey: 'mediaAssetId', as: 'posts' });
};

module.exports = MediaAsset;