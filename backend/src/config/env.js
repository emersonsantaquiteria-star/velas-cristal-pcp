require('dotenv').config();

const env = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://velas:velas123@localhost:5432/velas_cristal',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
};

module.exports = env;
