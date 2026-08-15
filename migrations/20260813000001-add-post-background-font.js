'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('posts_schedule', 'background_color', {
      type: Sequelize.DataTypes.STRING(16),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('posts_schedule', 'font', {
      type: Sequelize.DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('posts_schedule', 'font');
    await queryInterface.removeColumn('posts_schedule', 'background_color');
  },
};