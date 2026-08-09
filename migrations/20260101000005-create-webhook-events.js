'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('webhook_events', {
      id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      instance_id: {
        type: Sequelize.DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        defaultValue: null,
        references: { model: 'whatsapp_instances', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      event_type: { type: Sequelize.DataTypes.STRING(40), allowNull: false },
      payload: { type: Sequelize.DataTypes.JSON, allowNull: false },
      received_at: { type: Sequelize.DataTypes.DATE, allowNull: false },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('webhook_events');
  },
};