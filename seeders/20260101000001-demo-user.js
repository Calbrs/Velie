'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert(
      'users',
      [
        {
          id: 1,
          name: 'Demo User',
          email: 'demo@velie.app',
          phone: '+255799000001',
          access_token: 'demo-access-token-change-before-production',
          plan: 'free',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('users', { id: 1 }, {});
  },
};