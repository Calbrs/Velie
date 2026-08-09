'use strict';

const { Sequelize } = require('sequelize');
const config = require('./env');
const logger = require('../utils/logger');

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'mysql',
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  logging: config.env === 'development' ? (msg) => logger.debug(msg) : false,
  define: {
    underscored: true,
    timestamps: true,
  },
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established.');
  } catch (err) {
    logger.error(`Unable to connect to MySQL (${config.db.host}:${config.db.port}/${config.db.name}): ${err.message}`);
    throw err;
  }
}

module.exports = { sequelize, testConnection };