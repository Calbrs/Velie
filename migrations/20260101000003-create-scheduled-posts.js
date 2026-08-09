'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('scheduled_posts', {
      id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      instance_id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        references: { model: 'whatsapp_instances', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      type: {
        type: Sequelize.DataTypes.ENUM('image'),
        allowNull: false,
        defaultValue: 'image',
      },
      channel: {
        type: Sequelize.DataTypes.ENUM('wa_status', 'wa_group'),
        allowNull: false,
        defaultValue: 'wa_status',
      },
      group_id: { type: Sequelize.DataTypes.STRING(64), allowNull: true, defaultValue: null },
      content: { type: Sequelize.DataTypes.TEXT, allowNull: false },
      media_url: { type: Sequelize.DataTypes.STRING(255), allowNull: false },
      scheduled_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      timezone: {
        type: Sequelize.DataTypes.STRING(64),
        allowNull: false,
        defaultValue: 'Africa/Dar_es_Salaam',
      },
      status: {
        type: Sequelize.DataTypes.ENUM('pending', 'published', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: { type: Sequelize.DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      error: { type: Sequelize.DataTypes.TEXT, allowNull: true, defaultValue: null },
      published_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('scheduled_posts');
  },
};