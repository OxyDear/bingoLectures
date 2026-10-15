const router = require('express').Router();
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const users = require('../repositories/users');
const { wrap } = require('../middleware/http');
const { HttpError, badRequest } = require('../errors');
const { TIERS, CARD_SIZE } = require('../domain/rules');
const crypto = require('crypto');

const DUMMY = bcrypt.hashSync('dummy', 12); // выравниваем время ответа для несуществующих пользователей
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте позже.' }
});

const state = (req) => ({ user: req.user, csrfToken: req.session.csrf, config: { tiers: TIERS, cardSize: CARD_SIZE } });

// После входа сессия пересоздаётся (защита от фиксации сессии) — вместе с ней и CSRF-токен
const signIn = (req, userId) => new Promise((resolve, reject) => {
  req.session.regenerate((err) => {
    if (err) return reject(err);
    req.session.userId = userId;
    req.session.csrf = crypto.randomBytes(24).toString('hex');
    req.session.save((e) => (e ? reject(e) : resolve()));
  });
});

router.get('/me', (req, res) => res.json(state(req)));

router.post('/auth/login', limiter, wrap(async (req, res) => {
  const row = await users.findByUsername(String(req.body.username || '').trim());
  const ok = await bcrypt.compare(String(req.body.password || ''), row ? row.password_hash : DUMMY);
  if (!row || !ok) throw new HttpError(401, 'Неверное имя пользователя или пароль');
  await signIn(req, row.id);
  req.user = await users.findById(row.id);
  res.json(state(req));
}));

router.post('/auth/register', limiter, wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^[\p{L}\d_.-]{3,30}$/u.test(username)) throw badRequest('Имя: 3–30 символов, буквы, цифры, _ . -');
  if (password.length < 8) throw badRequest('Пароль должен быть не короче 8 символов');
  try {
    const user = await users.create(username, await bcrypt.hash(password, 12));
    await signIn(req, user.id);
    req.user = user;
    res.json(state(req));
  } catch (e) {
    if (e.code === '23505') throw badRequest('Это имя уже занято');
    throw e;
  }
}));

router.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

module.exports = router;
