'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('posts_schedule', 'viewer_count', {
      type: Sequelize.DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('posts_schedule', 'viewers', {
      type: Sequelize.DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('posts_schedule', 'viewers');
    await queryInterface.removeColumn('posts_schedule', 'viewer_count');
  },
};