require('dotenv').config();

const sslEnabled = process.env.DB_SSL === 'true';

const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
  dialectOptions: sslEnabled ? { ssl: { rejectUnauthorized: false } } : {},
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: { ...common },
  production: { ...common },
};