const bcrypt = require('bcrypt');
const config = require('../config');
const users = require('../repositories/users');

// Первый администратор создаётся из ADMIN_USERNAME / ADMIN_PASSWORD, только если админов ещё нет
async function seedAdmin() {
  const { username, password } = config.admin;
  if (!username || !password || (await users.hasAdmin())) return;
  await users.create(username, await bcrypt.hash(password, 12), 'admin');
  console.log('Создан администратор:', username);
}

module.exports = { seedAdmin };
