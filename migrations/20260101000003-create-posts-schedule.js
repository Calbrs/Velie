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
      image_url: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      caption: { type: Sequelize.DataTypes.TEXT, allowNull: false },
      channel: {
        type: Sequelize.DataTypes.ENUM('wa_status', 'wa_group', 'ig', 'fb', 'tiktok'),
        allowNull: false,
      },
      group_id: { type: Sequelize.DataTypes.STRING(64), allowNull: true, defaultValue: null },
      scheduled_time: { type: Sequelize.DataTypes.DATE, allowNull: false },
      status: {
        type: Sequelize.DataTypes.ENUM('pending', 'sent', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      retries: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_error: { type: Sequelize.DataTypes.TEXT, allowNull: true, defaultValue: null },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('posts_schedule');
  },
};