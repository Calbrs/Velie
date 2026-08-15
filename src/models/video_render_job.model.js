'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * A local video-render job. The backend stores the app's edit parameters
 * (composition), encodes the finished `.mp4` itself with the bundled ffmpeg
 * binary, then finalizes this row and wires the media to the post.
 */
const VideoRenderJob = sequelize.define(
  'VideoRenderJob',
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    businessId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    /** Post this render is attached to, if any (media automatically wired on completion). */
    postId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
    /** Provider project id (kept for any future cloud provider; unused by local ffmpeg). */
    providerJobId: { type: DataTypes.STRING(128), allowNull: true, defaultValue: null },
    /** The app's edit parameters that get translated into the render pipeline. */
    composition: { type: DataTypes.JSON, allowNull: false },
    status: {
      type: DataTypes.ENUM('queued', 'processing', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'queued',
    },
    /** Absolute URL (our /uploads copy) of the finished .mp4. */
    outputUrl: { type: DataTypes.STRING(1024), allowNull: true, defaultValue: null },
    error: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  { tableName: 'video_render_jobs', underscored: true }
);

VideoRenderJob.associate = (models) => {
  VideoRenderJob.belongsTo(models.Business, { foreignKey: 'businessId', as: 'business' });
  VideoRenderJob.belongsTo(models.PostSchedule, { foreignKey: 'postId', as: 'post' });
};

module.exports = VideoRenderJob;