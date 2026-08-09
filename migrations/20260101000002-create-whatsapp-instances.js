'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('whatsapp_instances', {
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
      instance_key: { type: Sequelize.DataTypes.STRING(64), allowNull: false, unique: true },
      status: {
        type: Sequelize.DataTypes.ENUM('disconnected', 'pending', 'connected'),
        allowNull: false,
        defaultValue: 'disconnected',
      },
      pairing_code: { type: Sequelize.DataTypes.STRING(16), allowNull: true, defaultValue: null },
      pairing_code_expires_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      connected_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('whatsapp_instances');
  },
};