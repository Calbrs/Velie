'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('businesses', {
      id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      business_name: { type: Sequelize.DataTypes.STRING(120), allowNull: false },
      owner_phone: { type: Sequelize.DataTypes.STRING(20), allowNull: false, unique: true },
      access_token: { type: Sequelize.DataTypes.STRING(64), allowNull: false, unique: true },
      plan: {
        type: Sequelize.DataTypes.ENUM('free', 'pro', 'business'),
        allowNull: false,
        defaultValue: 'free',
      },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('businesses');
  },
};