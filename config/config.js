require('dotenv').config();

const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
  define: {
    underscored: true,
    timestamps: true,
  },
};

module.exports = {
  development: { ...common },
  production: { ...common },
};