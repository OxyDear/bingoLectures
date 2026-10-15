const config = require('./config');
const { createApp } = require('./app');
const { migrate } = require('./db/migrate');
const { seedAdmin } = require('./db/seedAdmin');

migrate()
  .then(seedAdmin)
  .then(() => createApp().listen(config.port, () => console.log(`http://localhost:${config.port}`)))
  .catch((e) => { console.error('Не удалось запустить сервер:', e.message); process.exit(1); });
