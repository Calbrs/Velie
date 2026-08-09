'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('posts_schedule', {
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
      media_asset_id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        references: { model: 'media_assets', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      type: {
        type: Sequelize.DataTypes.ENUM('text', 'image', 'video'),
        allowNull: false,
        defaultValue: 'image',
      },
      content: { type: Sequelize.DataTypes.TEXT, allowNull: false },
      scheduled_time: { type: Sequelize.DataTypes.DATE, allowNull: false },
      status: {
        type: Sequelize.DataTypes.ENUM('pending', 'sent', 'failed', 'deleted'),
        allowNull: false,
        defaultValue: 'pending',
      },
      wsapi_status_id: { type: Sequelize.DataTypes.STRING(64), allowNull: true, defaultValue: null },
      retries: { type: Sequelize.DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      last_error: { type: Sequelize.DataTypes.TEXT, allowNull: true, defaultValue: null },
      published_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('posts_schedule');
  },
};