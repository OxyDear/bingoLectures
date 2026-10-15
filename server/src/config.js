const path = require('path');
// .env лежит в корне репозитория, независимо от того, откуда запущен npm-скрипт
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prod = process.env.NODE_ENV === 'production';
const required = (key) => {
  if (!process.env[key]) throw new Error(`Не задана переменная окружения ${key}`);
  return process.env[key];
};

module.exports = {
  prod,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required('DATABASE_URL'),
  // В production без SESSION_SECRET приложение не стартует (раньше подставлялся 'dev-secret')
  sessionSecret: prod ? required('SESSION_SECRET') : process.env.SESSION_SECRET || 'dev-secret',
  // За прокси (Render, Heroku, nginx) укажите TRUST_PROXY=1, иначе cookie не станет secure
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false,
  admin: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }
};
