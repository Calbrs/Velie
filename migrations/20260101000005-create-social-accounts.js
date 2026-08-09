'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('social_accounts', {
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
      platform: {
        type: Sequelize.DataTypes.ENUM('ig', 'fb', 'tiktok', 'x'),
        allowNull: false,
      },
      access_token: { type: Sequelize.DataTypes.STRING(255), allowNull: true, defaultValue: null },
      connected_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('social_accounts');
  },
};