const crypto = require('crypto');
const { HttpError } = require('../errors');
const users = require('../repositories/users');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Загружаем пользователя и гарантируем наличие CSRF-токена в сессии
const loadSession = wrap(async (req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  req.user = req.session.userId ? await users.findById(req.session.userId) : null;
  next();
});

// Токен приходит в заголовке X-CSRF-Token (его добавляет клиент для всех не-GET запросов)
function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const given = Buffer.from(String(req.get('x-csrf-token') || ''));
  const expected = Buffer.from(req.session.csrf);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected))
    return next(new HttpError(403, 'Сессия устарела. Обновите страницу и повторите.'));
  next();
}

const needUser = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Требуется вход')));
const needAdmin = (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Требуется вход'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Доступ только для администратора'));
  next();
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON' });
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
};

module.exports = { wrap, loadSession, verifyCsrf, needUser, needAdmin, errorHandler };
