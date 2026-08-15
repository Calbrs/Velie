'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('video_render_jobs', {
      id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      business_id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'businesses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      post_id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        references: { model: 'posts_schedule', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      provider_job_id: { type: Sequelize.DataTypes.STRING(128), allowNull: true, defaultValue: null },
      composition: { type: Sequelize.DataTypes.JSON, allowNull: false },
      status: {
        type: Sequelize.DataTypes.ENUM('queued', 'processing', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'queued',
      },
      output_url: { type: Sequelize.DataTypes.STRING(1024), allowNull: true, defaultValue: null },
      error: { type: Sequelize.DataTypes.TEXT, allowNull: true, defaultValue: null },
      completed_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });

    await queryInterface.addIndex('video_render_jobs', ['status', 'provider_job_id']);
    await queryInterface.addIndex('video_render_jobs', ['business_id', 'id']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('video_render_jobs');
  },
};