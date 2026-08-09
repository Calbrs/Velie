'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('businesses', 'name', {
      type: Sequelize.DataTypes.STRING(120),
      allowNull: true,
    });
    await queryInterface.addColumn('businesses', 'password_hash', {
      type: Sequelize.DataTypes.STRING(255),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('businesses', 'password_hash');
    await queryInterface.removeColumn('businesses', 'name');
  },
};
