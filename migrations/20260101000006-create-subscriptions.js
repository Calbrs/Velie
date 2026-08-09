'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('subscriptions', {
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
      plan: { type: Sequelize.DataTypes.ENUM('free', 'pro', 'business'), allowNull: false },
      billing_cycle: {
        type: Sequelize.DataTypes.ENUM('monthly', 'annual'),
        allowNull: true,
        defaultValue: null,
      },
      price_amount: { type: Sequelize.DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: null },
      currency: { type: Sequelize.DataTypes.STRING(6), allowNull: false, defaultValue: 'TZS' },
      payment_provider: { type: Sequelize.DataTypes.STRING(40), allowNull: true, defaultValue: null },
      payment_ref: { type: Sequelize.DataTypes.STRING(120), allowNull: true, defaultValue: null },
      started_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      expires_at: { type: Sequelize.DataTypes.DATE, allowNull: true, defaultValue: null },
      status: {
        type: Sequelize.DataTypes.ENUM('active', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'active',
      },
      created_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
      updated_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('subscriptions');
  },
};