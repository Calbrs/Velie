'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.bulkInsert(
      'businesses',
      [
        {
          id: 1,
          business_name: 'Demo Duka',
          owner_phone: '+255799000001',
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
    await queryInterface.bulkDelete('businesses', { id: 1 }, {});
  },
};