'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: { type: Sequelize.DataTypes.STRING(120), allowNull: false },
      email: { type: Sequelize.DataTypes.STRING(160), allowNull: false, unique: true },
      phone: { type: Sequelize.DataTypes.STRING(20), allowNull: true, defaultValue: null },
      access_token: { type: Sequelize.DataTypes.STRING(64), allowNull: false, unique: true },
      plan: {
        type: Sequelize.DataTypes.ENUM('free', 'pro'),
        allowNull: false,
        defaultValue: 'free',
      },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('users');
  },
};