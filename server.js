require('dotenv').config();
const fs = require('fs');
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

// Допустимые очки пиков и их названия
const TIERS = [
  { points: 1, name: 'безопасные' },
  { points: 3, name: 'вероятные' },
  { points: 5, name: 'маловероятные' },
  { points: 10, name: 'невозможно' }
];
const ALLOWED = TIERS.map((t) => t.points);
app.locals.TIERS = TIERS;
app.locals.hot = (n) => (n === 10 ? '🔥' : '');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 5000 }));
app.use(express.static(path.join(__dirname, 'public')));

// CSS вставляется прямо в <head>: страница не зависит от отдельного запроса за стилями
// (на медленном соединении в iOS Safari внешний CSS мог «отваливаться»).
const CSS_PATH = path.join(__dirname, 'public', 'style.css');
const cssCache = fs.readFileSync(CSS_PATH, 'utf8');
app.use((req, res, next) => {
  res.locals.css = process.env.NODE_ENV === 'production' ? cssCache : fs.readFileSync(CSS_PATH, 'utf8');
  next();
});
app.use(session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 }
}));

app.use(wrap(async (req, res, next) => {
  // Сохраняем сессию до редиректа, иначе flash-сообщение иногда теряется
  const redirect = res.redirect.bind(res);
  res.redirect = (...args) => req.session.save(() => redirect(...args));
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
const getPeople = async (eid) => (await pool.query('SELECT * FROM people WHERE event_id=$1 ORDER BY id', [eid])).rows;
const getMyPerson = async (eid, uid) => (await pool.query(
  'SELECT p.* FROM card_person c JOIN people p ON p.id=c.person_id WHERE c.event_id=$1 AND c.user_id=$2', [eid, uid])).rows[0] || null;
const getMyPickIds = async (eid, uid) => new Set((await pool.query(
  'SELECT pick_id FROM card_picks WHERE event_id=$1 AND user_id=$2', [eid, uid])).rows.map((r) => r.pick_id));

// В карточке 9 пиков. Если в событии есть люди для рулетки, один из девяти — «Пик на человека»,
// а обычных пиков тогда 8.
const needRegular = (total, hasPeople) => Math.min(hasPeople ? 8 : 9, total);
const withRanks = (rows) => rows.map((r) => ({ ...r, rank: 1 + rows.filter((x) => x.score > r.score).length }));

// Очки игрока в событии = сумма сбывшихся пиков + очки выпавшего человека
const EVENT_BOARD = `
  SELECT u.id, u.username,
    (COALESCE((SELECT SUM(p.points) FROM card_picks c JOIN picks p ON p.id=c.pick_id
               WHERE c.user_id=u.id AND c.event_id=$1 AND p.result='correct'),0)
     + COALESCE((SELECT pe.points FROM card_person cp JOIN people pe ON pe.id=cp.person_id
               WHERE cp.user_id=u.id AND cp.event_id=$1),0))::int AS score
  FROM users u
  WHERE EXISTS (SELECT 1 FROM card_picks c WHERE c.user_id=u.id AND c.event_id=$1)
  ORDER BY score DESC, u.username`;

// Общий рейтинг: только события с закрытым приёмом карточек
const GLOBAL_BOARD = `
  WITH joined AS (
    SELECT c.user_id, c.event_id FROM card_picks c JOIN events e ON e.id=c.event_id
    WHERE e.status='closed' GROUP BY c.user_id, c.event_id
  ), sc AS (
    SELECT j.user_id, j.event_id,
      COALESCE((SELECT SUM(p.points) FROM card_picks c JOIN picks p ON p.id=c.pick_id
                WHERE c.user_id=j.user_id AND c.event_id=j.event_id AND p.result='correct'),0)
      + COALESCE((SELECT pe.points FROM card_person cp JOIN people pe ON pe.id=cp.person_id
                WHERE cp.user_id=j.user_id AND cp.event_id=j.event_id),0) AS pts
    FROM joined j
  )
  SELECT u.id, u.username, SUM(sc.pts)::int AS score, COUNT(*)::int AS events
  FROM sc JOIN users u ON u.id=sc.user_id
  GROUP BY u.id, u.username ORDER BY score DESC, u.username`;

app.get('/events', needUser, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.*, (SELECT count(*)::int FROM picks p WHERE p.event_id=e.id) AS total,
      (SELECT count(*)::int FROM card_picks c WHERE c.event_id=e.id AND c.user_id=$1) AS mine
    FROM events e ORDER BY e.created_at DESC`, [req.user.id]);
  res.render('events', { events: rows, title: 'События' });
}));

app.get('/leaderboard', needUser, wrap(async (req, res) => {
  const board = withRanks((await pool.query(GLOBAL_BOARD)).rows);
  res.render('leaderboard', { board, title: 'Общий рейтинг' });
}));

app.get('/events/:id', needUser, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const closed = ev.status === 'closed';
  const picks = await getPicks(ev.id);
  const mine = await getMyPickIds(ev.id, req.user.id);
  if (!closed && !mine.size) return res.redirect(`/events/${ev.id}/choose`);
  const people = await getPeople(ev.id);
  const person = await getMyPerson(ev.id, req.user.id);

  // Пока приём открыт, результаты и очки не отдаём в шаблон вообще
  const cards = picks.filter((p) => mine.has(p.id))
    .map((p) => (closed ? p : { ...p, result: null, explanation: '' }));
  const shownPerson = person && (closed ? person : { ...person, points: null });

  let board = [], me = null, rank = null, top = null;
  if (closed) {
    board = withRanks((await pool.query(EVENT_BOARD, [ev.id])).rows);
    me = board.find((r) => r.id === req.user.id) || null;
    rank = me ? me.rank : null;
    top = me ? Math.ceil((rank / board.length) * 100) : null;
  }
  res.render('event', { ev, closed, cards, hasPeople: people.length > 0, person: shownPerson, board, me, rank, top, title: ev.title });
}));

app.get('/events/:id/choose', needUser, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  if (ev.status !== 'open') { flash(req, 'error', 'Приём карточек закрыт'); return res.redirect(`/events/${ev.id}`); }
  const picks = await getPicks(ev.id);
  const people = await getPeople(ev.id);
  const person = await getMyPerson(ev.id, req.user.id);
  res.render('choose', {
    ev, picks, people, person, mine: await getMyPickIds(ev.id, req.user.id),
    need: needRegular(picks.length, people.length > 0), title: ev.title
  });
}));

// Рулетка: результат выбирается на сервере и сохраняется — перекрутить нельзя
app.post('/events/:id/spin', needUser, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.status(404).json({ error: 'Событие не найдено' });
  if (ev.status !== 'open') return res.status(403).json({ error: 'Приём карточек закрыт' });
  const people = await getPeople(ev.id);
  if (!people.length) return res.status(400).json({ error: 'В этом событии нет людей для рулетки' });

  let person = await getMyPerson(ev.id, req.user.id);
  let already = !!person;
  if (!person) {
    const winner = people[crypto.randomInt(people.length)];
    const ins = await pool.query(
      'INSERT INTO card_person (user_id, event_id, person_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING person_id',
      [req.user.id, ev.id, winner.id]);
    person = ins.rowCount ? winner : await getMyPerson(ev.id, req.user.id);
    already = !ins.rowCount;
  }
  res.json({ id: person.id, name: person.name, index: people.findIndex((x) => x.id === person.id), already });
}));

app.post('/events/:id/card', needUser, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const back = `/events/${ev.id}/choose`;
  if (ev.status !== 'open') { flash(req, 'error', 'Приём карточек закрыт'); return res.redirect(`/events/${ev.id}`); }
  const ids = [].concat(req.body.picks || []).map(toInt).filter((n) => n !== null);
  const total = (await pool.query('SELECT count(*)::int AS n FROM picks WHERE event_id=$1', [ev.id])).rows[0].n;
  const hasPeople = (await getPeople(ev.id)).length > 0;
  const need = needRegular(total, hasPeople);
  const valid = (await pool.query('SELECT id FROM picks WHERE event_id=$1 AND id=ANY($2::int[])', [ev.id, ids])).rows;
  if (!total || valid.length !== ids.length || ids.length !== need) {
    flash(req, 'error', `Выберите ровно ${need} пиков`); return res.redirect(back);
  }
  if (hasPeople && !(await getMyPerson(ev.id, req.user.id))) {
    flash(req, 'error', 'Сначала прокрутите рулетку — «Пик на человека» входит в вашу карточку'); return res.redirect(back);
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
  res.render('admin_event', { ev, picks: await getPicks(ev.id), people: await getPeople(ev.id), title: ev.title });
}));

app.post('/admin/events/:id/picks', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const title = String(req.body.title || '').trim().slice(0, 200);
  const points = toInt(req.body.points);
  if (!title) flash(req, 'error', 'Введите текст пика');
  else if (!ALLOWED.includes(points)) flash(req, 'error', 'Очки могут быть только 1, 3, 5 или 10');
  else await pool.query('INSERT INTO picks (event_id, title, category, points) VALUES ($1,$2,$3,$4)', [ev.id, title, String(req.body.category || '').trim().slice(0, 40), points]);
  res.redirect(`/admin/events/${ev.id}`);
}));

app.post('/admin/picks/:id/delete', needAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM picks WHERE id=$1 RETURNING event_id', [toInt(req.params.id)]);
  if (!rows[0]) return res.sendStatus(404);
  res.redirect(`/admin/events/${rows[0].event_id}`);
}));

// люди для «Пика на человека»
app.post('/admin/events/:id/people', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const name = String(req.body.name || '').trim().slice(0, 60);
  if (!name) flash(req, 'error', 'Введите имя');
  else if ((await getPeople(ev.id)).some((x) => x.name.toLowerCase() === name.toLowerCase())) flash(req, 'error', 'Такой человек уже добавлен');
  else await pool.query('INSERT INTO people (event_id, name) VALUES ($1,$2)', [ev.id, name]);
  res.redirect(`/admin/events/${ev.id}`);
}));

app.post('/admin/people/:id/delete', needAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('DELETE FROM people WHERE id=$1 RETURNING event_id', [toInt(req.params.id)]);
  if (!rows[0]) return res.sendStatus(404);
  res.redirect(`/admin/events/${rows[0].event_id}`);
}));

// ---------- результаты (отдельная страница) ----------
app.get('/admin/events/:id/results', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  res.render('admin_results', { ev, picks: await getPicks(ev.id), people: await getPeople(ev.id), title: `Результаты — ${ev.title}` });
}));

app.post('/admin/events/:id/results', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const back = `/admin/events/${ev.id}/results`;
  const picks = await getPicks(ev.id);
  const people = await getPeople(ev.id);

  const personPts = [];
  for (const pe of people) {
    const raw = String(req.body[`pp_${pe.id}`] ?? '').trim();
    if (raw === '') { personPts.push([pe.id, null]); continue; }
    if (!/^\d{1,3}$/.test(raw) || Number(raw) > 100) { flash(req, 'error', `Очки для «${pe.name}»: целое число от 0 до 100`); return res.redirect(back); }
    personPts.push([pe.id, Number(raw)]);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of picks) {
      const r = req.body[`result_${p.id}`];
      await client.query('UPDATE picks SET result=$1, explanation=$2 WHERE id=$3',
        [['correct', 'incorrect'].includes(r) ? r : null, String(req.body[`expl_${p.id}`] ?? '').trim().slice(0, 300), p.id]);
    }
    for (const [id, pts] of personPts) await client.query('UPDATE people SET points=$1 WHERE id=$2', [pts, id]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  flash(req, 'ok', 'Результаты сохранены');
  res.redirect(back);
}));

// ---------- экспорт / импорт (JSON) ----------
const MAX_IMPORT = 500;
const parsePoints = (v) => {
  if (v === undefined || v === null || v === '') return 3;
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Number(v);
  return ALLOWED.includes(n) ? n : null;
};

app.get('/admin/events/:id/picks.json', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const picks = (await getPicks(ev.id)).map((p) => ({
    title: p.title, category: p.category, points: p.points, result: p.result, explanation: p.explanation
  }));
  const people = (await getPeople(ev.id)).map((x) => ({ name: x.name, points: x.points }));
  res.attachment(`picks-event-${ev.id}.json`);
  res.type('application/json').send(JSON.stringify({ event: ev.title, picks, people }, null, 2));
}));

app.post('/admin/events/:id/import', needAdmin, wrap(async (req, res) => {
  const ev = await getEvent(req.params.id); if (!ev) return res.sendStatus(404);
  const back = `/admin/events/${ev.id}`;
  const fail = (text) => { flash(req, 'error', text); return res.redirect(back); };

  let data;
  try { data = JSON.parse(String(req.body.json || '').replace(/^\uFEFF/, '')); }
  catch (e) { return fail('Не удалось прочитать JSON: проверьте формат файла'); }

  const picksList = Array.isArray(data) ? data : (data && Array.isArray(data.picks) ? data.picks : []);
  const peopleList = data && !Array.isArray(data) && Array.isArray(data.people) ? data.people : null;
  if (!picksList.length && !(peopleList && peopleList.length))
    return fail('В JSON не найден список пиков (нужен массив или объект с полем "picks")');
  if (picksList.length > MAX_IMPORT || (peopleList && peopleList.length > MAX_IMPORT))
    return fail(`Слишком много записей за раз (максимум ${MAX_IMPORT})`);

  const replace = req.body.replace === '1';
  const st = { picks: 0, people: 0, dups: 0, invalid: 0, badPoints: 0 };
  const seen = new Set(), seenPeople = new Set();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (replace) {
      await client.query('DELETE FROM picks WHERE event_id=$1', [ev.id]);
      if (peopleList) await client.query('DELETE FROM people WHERE event_id=$1', [ev.id]);
    } else {
      (await client.query('SELECT title FROM picks WHERE event_id=$1', [ev.id])).rows.forEach((r) => seen.add(r.title.toLowerCase()));
      (await client.query('SELECT name FROM people WHERE event_id=$1', [ev.id])).rows.forEach((r) => seenPeople.add(r.name.toLowerCase()));
    }

    for (const raw of picksList) {
      const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const title = String(typeof raw === 'string' ? raw : (obj.title ?? '')).trim().slice(0, 200);
      if (!title) { st.invalid++; continue; }
      const points = parsePoints(obj.points);
      if (points === null) { st.badPoints++; continue; }
      const key = title.toLowerCase();
      if (seen.has(key)) { st.dups++; continue; }
      seen.add(key);
      await client.query(
        'INSERT INTO picks (event_id, title, category, points, result, explanation) VALUES ($1,$2,$3,$4,$5,$6)',
        [ev.id, title, String(obj.category ?? '').trim().slice(0, 40), points,
          ['correct', 'incorrect'].includes(obj.result) ? obj.result : null, String(obj.explanation ?? '').trim().slice(0, 300)]);
      st.picks++;
    }

    for (const raw of peopleList || []) {
      const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      const name = String(typeof raw === 'string' ? raw : (obj.name ?? '')).trim().slice(0, 60);
      if (!name) { st.invalid++; continue; }
      let pts = null;
      if (obj.points !== undefined && obj.points !== null && obj.points !== '') {
        const n = Number(obj.points);
        if (!Number.isInteger(n) || n < 0 || n > 100) { st.invalid++; continue; }
        pts = n;
      }
      const key = name.toLowerCase();
      if (seenPeople.has(key)) { st.dups++; continue; }
      seenPeople.add(key);
      await client.query('INSERT INTO people (event_id, name, points) VALUES ($1,$2,$3)', [ev.id, name, pts]);
      st.people++;
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  const done = [`пиков: ${st.picks}`, peopleList && `людей: ${st.people}`].filter(Boolean).join(', ');
  const skipped = [st.dups && `дубликатов: ${st.dups}`, st.invalid && `некорректных: ${st.invalid}`,
    st.badPoints && `с недопустимыми очками (разрешены 1, 3, 5, 10): ${st.badPoints}`].filter(Boolean).join(', ');
  flash(req, st.picks + st.people ? 'ok' : 'error', `Импортировано — ${done}${skipped ? `. Пропущено — ${skipped}` : ''}`);
  res.redirect(back);
}));

app.post('/admin/events/:id/status', needAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query("UPDATE events SET status = CASE WHEN status='open' THEN 'closed' ELSE 'open' END WHERE id=$1 RETURNING id, status", [toInt(req.params.id)]);
  if (!rows[0]) return res.sendStatus(404);
  flash(req, 'ok', rows[0].status === 'closed'
    ? 'Изменение карточек закрыто. Игроки видят результаты и таблицу лидеров.'
    : 'Изменение карточек снова открыто. Результаты скрыты от игроков.');
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
