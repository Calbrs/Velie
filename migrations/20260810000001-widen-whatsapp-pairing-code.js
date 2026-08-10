'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('whatsapp_instances', 'pairing_code', {
      type: Sequelize.DataTypes.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('whatsapp_instances', 'pairing_code', {
      type: Sequelize.DataTypes.STRING(16),
      allowNull: true,
      defaultValue: null,
    });
  },
};
