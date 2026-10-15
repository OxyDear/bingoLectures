const path = require('path');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const helmet = require('helmet');
const config = require('./config');
const { pool } = require('./db/pool');
const { loadSession, verifyCsrf, errorHandler } = require('./middleware/http');
const { notFound } = require('./errors');

function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ['https://fonts.gstatic.com'],
        upgradeInsecureRequests: null
      }
    }
  }));
  app.use(express.json({ limit: '1mb' }));

  const api = express.Router();
  api.get('/health', (req, res, next) => pool.query('SELECT 1').then(() => res.json({ ok: true }), next));
  api.use(session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: config.sessionSecret, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.prod ? 'auto' : false, maxAge: 30 * 24 * 3600 * 1000 }
  }));
  api.use(loadSession, verifyCsrf);
  api.use(require('./routes/auth'));
  api.use('/admin', require('./routes/admin'));
  api.use(require('./routes/events'));
  api.use((req, res, next) => next(notFound()));
  app.use('/api', api);

  // В production Express сам раздаёт собранный React-клиент
  const dist = path.join(__dirname, '../../client/dist');
  app.use(express.static(dist));
  app.get('*', (req, res, next) => res.sendFile(path.join(dist, 'index.html'), (err) => err && next(notFound())));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
