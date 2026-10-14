require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const { pool, init } = require('./db');

const app = express();
const DUMMY = bcrypt.hashSync('dummy', 12);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const flash = (req, type, text) => { req.session.flash = { type, text }; };
const toInt = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; };

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 }
}));

app.use(wrap(async (req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  req.user = res.locals.user = null;
  if (req.session.userId) {
    const { rows } = await pool.query('SELECT id, username, role FROM users WHERE id=$1', [req.session.userId]);
    req.user = res.locals.user = rows[0] || null;
  }
  if (req.method === 'POST' && req.body._csrf !== req.session.csrf)
    return res.status(403).send('Сессия устарела. Обновите страницу и повторите.');
  next();
}));

const needUser = (req, res, next) => (req.user ? next() : res.redirect('/login'));
const needAdmin = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : res.status(403).send('Доступ только для администратора'));

// ---------- авторизация ----------
const signIn = (req, res, next, id) => req.session.regenerate((err) => {
  if (err) return next(err);
  req.session.userId = id;
  req.session.save(() => res.redirect('/events'));
});

app.get('/', (req, res) => res.redirect(req.user ? '/events' : '/login'));
app.get('/login', (req, res) => res.render('auth', { mode: 'login', title: 'Вход' }));
app.get('/register', (req, res) => res.render('auth', { mode: 'register', title: 'Регистрация' }));

app.post('/login', wrap(async (req, res, next) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [String(req.body.username || '').trim()]);
  const ok = await bcrypt.compare(String(req.body.password || ''), rows[0] ? rows[0].password_hash : DUMMY);
  if (!rows[0] || !ok) { flash(req, 'error', 'Неверное имя пользователя или пароль'); return res.redirect('/login'); }
  signIn(req, res, next, rows[0].id);
}));

app.post('/register', wrap(async (req, res, next) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!/^[\p{L}\d_.-]{3,30}$/u.test(username)) { flash(req, 'error', 'Имя: 3–30 символов, буквы, цифры, _ . -'); return res.redirect('/register'); }
  if (password.length < 8) { flash(req, 'error', 'Пароль должен быть не короче 8 символов'); return res.redirect('/register'); }
  try {
    const { rows } = await pool.query('INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING id', [username, await bcrypt.hash(password, 12)]);
    signIn(req, res, next, rows[0].id);
  } catch (e) {
    if (e.code !== '23505') throw e;
    flash(req, 'error', 'Это имя уже занято'); res.redirect('/register');
  }
}));

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

// ---------- события и карточки ----------
const getEvent = async (id) => {
  const n = toInt(id); if (n === null) return null;
  return (await pool.query('SELECT * FROM events WHERE id=$1', [n])).rows[0] || null;
};
const getPicks = async (eid) => (await pool.query('SELECT * FROM picks WHERE event_id=$1 ORDER BY id', [eid])).rows;
const LEADERBOARD = `
  SELECT u.id, u.username, COALESCE(SUM(p.points) FILTER (WHERE p.result='correct'),0)::int AS score
  FROM card_picks c JOIN users u ON u.id=c.user_id JOIN picks p ON p.id=c.pick_id
  WHERE c.event_id=$1 GROUP BY u.id ORDER BY score DESC, u.username`;

app.get('/events', needUser, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, (SELECT count(*)::int FROM picks p WHERE p.event_id=e.id) AS total,
      (SELECT count(*)::int FROM card_picks c WHERE c.event_id=e.id AND c.user_id=$1) AS mine
    FROM events e ORDER BY e.created_at DESC`, [req.user.id]);
  res.render('events', { events: rows, title: 'События' });
}));

app.get('/events/:id', needUser, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const picks = await getPicks(ev.id);
  const mine = new Set((await pool.query('SELECT pick_id FROM card_picks WHERE event_id=$1 AND user_id=$2', [ev.id, req.user.id])).rows.map((r) => r.pick_id));
  if (ev.status === 'open' && !mine.size) return res.redirect(`/events/${ev.id}/choose`);
  const cards = picks.filter((p) => mine.has(p.id));
  const board = (await pool.query(LEADERBOARD, [ev.id])).rows;
  const me = board.find((r) => r.id === req.user.id) || null;
  const rank = me ? 1 + board.filter((r) => r.score > me.score).length : null;
  res.render('event', { ev, cards, board, me, rank, top: me ? Math.ceil((rank / board.length) * 100) : null, title: ev.title });
}));

app.get('/events/:id/choose', needUser, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  if (ev.status !== 'open') { flash(req, 'error', 'Приём карточек закрыт'); return res.redirect(`/events/${ev.id}`); }
  const picks = await getPicks(ev.id);
  const mine = new Set((await pool.query('SELECT pick_id FROM card_picks WHERE event_id=$1 AND user_id=$2', [ev.id, req.user.id])).rows.map((r) => r.pick_id));
  res.render('choose', { ev, picks, mine, need: Math.min(9, picks.length), title: ev.title });
}));

app.post('/events/:id/card', needUser, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  if (ev.status !== 'open') { flash(req, 'error', 'Приём карточек закрыт'); return res.redirect(`/events/${ev.id}`); }
  const ids = [].concat(req.body.picks || []).map(toInt).filter((n) => n !== null);
  const total = (await pool.query('SELECT count(*)::int AS n FROM picks WHERE event_id=$1', [ev.id])).rows[0].n;
  const valid = (await pool.query('SELECT id FROM picks WHERE event_id=$1 AND id=ANY($2::int[])', [ev.id, ids])).rows;
  if (!total || valid.length !== ids.length || ids.length !== Math.min(9, total)) {
    flash(req, 'error', `Выберите ровно ${Math.min(9, total)} пиков`); return res.redirect(`/events/${ev.id}/choose`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM card_picks WHERE event_id=$1 AND user_id=$2', [ev.id, req.user.id]);
    for (const id of ids) await client.query('INSERT INTO card_picks (user_id, pick_id, event_id) VALUES ($1,$2,$3)', [req.user.id, id, ev.id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  flash(req, 'ok', 'Карточка сохранена');
  res.redirect(`/events/${ev.id}`);
}));

// ---------- админка ----------
app.get('/admin', needAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT e.*, (SELECT count(*)::int FROM picks p WHERE p.event_id=e.id) AS total FROM events e ORDER BY e.created_at DESC');
  res.render('admin', { events: rows, title: 'Админка' });
}));

app.post('/admin/events', needAdmin, wrap(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120);
  if (!title) { flash(req, 'error', 'Введите название события'); return res.redirect('/admin'); }
  const { rows } = await pool.query('INSERT INTO events (title) VALUES ($1) RETURNING id', [title]);
  res.redirect(`/admin/events/${rows[0].id}`);
}));

app.get('/admin/events/:id', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  res.render('admin_event', { ev, picks: await getPicks(ev.id), title: ev.title });
}));

app.post('/admin/events/:id/picks', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const title = String(req.body.title || '').trim().slice(0, 200);
  const points = Math.min(20, Math.max(1, toInt(req.body.points) || 3));
  if (!title) flash(req, 'error', 'Введите текст пика');
  else await pool.query('INSERT INTO picks (event_id, title, category, points) VALUES ($1,$2,$3,$4)', [ev.id, title, String(req.body.category || '').trim().slice(0, 40), points]);
  res.redirect(`/admin/events/${ev.id}`);
}));

// ---------- экспорт / импорт пиков (JSON) ----------
const MAX_IMPORT = 500;

app.get('/admin/events/:id/picks.json', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const picks = (await getPicks(ev.id)).map((p) => ({
    title: p.title, category: p.category, points: p.points, result: p.result, explanation: p.explanation
  }));
  res.attachment(`picks-event-${ev.id}.json`);
  res.type('application/json').send(JSON.stringify({ event: ev.title, picks }, null, 2));
}));

app.post('/admin/events/:id/import', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const back = `/admin/events/${ev.id}`;
  const fail = (text) => { flash(req, 'error', text); return res.redirect(back); };

  let data;
  try { data = JSON.parse(String(req.body.json || '').replace(/^\uFEFF/, '')); }
  catch (e) { return fail('Не удалось прочитать JSON: проверьте формат файла'); }

  const list = Array.isArray(data) ? data : (data && Array.isArray(data.picks) ? data.picks : null);
  if (!list || !list.length) return fail('В JSON не найден список пиков (нужен массив или объект с полем "picks")');
  if (list.length > MAX_IMPORT) return fail(`Слишком много пиков за раз (максимум ${MAX_IMPORT})`);

  const replace = req.body.replace === '1';
  const seen = new Set();
  const parsed = [];
  let invalid = 0, dups = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (replace) {
      await client.query('DELETE FROM picks WHERE event_id=$1', [ev.id]);
    } else {
      (await client.query('SELECT title FROM picks WHERE event_id=$1', [ev.id])).rows
        .forEach((r) => seen.add(r.title.toLowerCase()));
    }
    for (const raw of list) {
      const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const title = String(typeof raw === 'string' ? raw : (obj.title ?? '')).trim().slice(0, 200);
      if (!title) { invalid++; continue; }
      const key = title.toLowerCase();
      if (seen.has(key)) { dups++; continue; }
      seen.add(key);
      parsed.push([
        ev.id, title,
        String(obj.category ?? '').trim().slice(0, 40),
        Math.min(20, Math.max(1, toInt(obj.points) || 3)),
        ['correct', 'incorrect'].includes(obj.result) ? obj.result : null,
        String(obj.explanation ?? '').trim().slice(0, 300)
      ]);
    }
    for (const row of parsed)
      await client.query('INSERT INTO picks (event_id, title, category, points, result, explanation) VALUES ($1,$2,$3,$4,$5,$6)', row);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  const skipped = [dups && `дубликатов: ${dups}`, invalid && `некорректных: ${invalid}`].filter(Boolean).join(', ');
  flash(req, parsed.length ? 'ok' : 'error', `Импортировано пиков: ${parsed.length}${skipped ? `. Пропущено — ${skipped}` : ''}`);
  res.redirect(back);
}));

app.post('/admin/picks/:id/result', needAdmin, wrap(async (req, res) => {
  const result = ['correct', 'incorrect'].includes(req.body.result) ? req.body.result : null;
  const { rows } = await pool.query('UPDATE picks SET result=$1, explanation=$2 WHERE id=$3 RETURNING event_id', [result, String(req.body.explanation || '').trim().slice(0, 300), toInt(req.params.id)]);
  if (!rows[0]) return res.sendStatus(404);
  flash(req, 'ok', 'Результат сохранён');
  res.redirect(`/admin/events/${rows[0].event_id}`);
}));

app.post('/admin/picks/:id/delete', needAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM picks WHERE id=$1 RETURNING event_id', [toInt(req.params.id)]);
  if (!rows[0]) return res.sendStatus(404);
  res.redirect(`/admin/events/${rows[0].event_id}`);
}));

app.post('/admin/events/:id/status', needAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query("UPDATE events SET status = CASE WHEN status='open' THEN 'closed' ELSE 'open' END WHERE id=$1 RETURNING id", [toInt(req.params.id)]);
  if (!rows[0]) return res.sendStatus(404);
  res.redirect(`/admin/events/${rows[0].id}`);
}));

app.post('/admin/events/:id/delete', needAdmin, wrap(async (req, res) => {
  await pool.query('DELETE FROM events WHERE id=$1', [toInt(req.params.id)]);
  flash(req, 'ok', 'Событие удалено');
  res.redirect('/admin');
}));

app.use((err, req, res, next) => { console.error(err); res.status(500).send('Ошибка сервера'); });

init().then(() => app.listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000))))
  .catch((e) => { console.error('Не удалось подключиться к БД:', e.message); process.exit(1); });
