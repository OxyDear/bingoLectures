// Сквозная проверка API на запущенном сервере: BASE=http://localhost:3000 ADMIN=admin:пароль node scripts/smoke.js
const BASE = (process.env.BASE || 'http://localhost:3000') + '/api';
const [AU, AP] = (process.env.ADMIN || 'admin:adminpass123').split(':');

function client() {
  let cookie = '', csrf = '';
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const sc = res.headers.getSetCookie?.() || [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const data = await res.json().catch(() => null);
    if (data && data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data };
  };
  return { call, boot: () => call('GET', '/me') };
}
let failed = 0;
const check = (name, cond, extra) => { console.log(cond ? 'ok  ' : 'FAIL', name, cond ? '' : JSON.stringify(extra)); if (!cond) failed++; };

(async () => {
  const admin = client(); await admin.boot();
  check('вход админа', (await admin.call('POST', '/auth/login', { username: AU, password: AP })).status === 200);
  const ev = (await admin.call('POST', '/admin/events', { title: 'Smoke ' + Date.now() })).data;
  const picks = Array.from({ length: 10 }, (_, i) => ({ title: 'Пик ' + i, category: 'К', points: [1, 3, 5, 10][i % 4] }));
  const imp = await admin.call('POST', `/admin/events/${ev.id}/import`, { json: JSON.stringify({ picks: [...picks, { title: 'bad', points: 7 }, 'Пик 0'], people: [{ name: 'Аня' }, { name: 'Борис' }] }) });
  check('импорт', imp.data.ok && /пиков: 10/.test(imp.data.message) && /дубликатов: 1/.test(imp.data.message) && /недопустимыми/.test(imp.data.message), imp.data);

  const u = client(); await u.boot();
  const name = 'user' + Date.now();
  check('регистрация', (await u.call('POST', '/auth/register', { username: name, password: 'password123' })).status === 200);
  const ch = (await u.call('GET', `/events/${ev.id}/choose`)).data;
  check('в choose нет результатов', ch.picks.every((p) => !('result' in p) && !('explanation' in p)) && ch.need === 8, ch);
  check('сохранение без рулетки запрещено', (await u.call('PUT', `/events/${ev.id}/card`, { picks: ch.picks.slice(0, 8).map((p) => p.id) })).status === 400);
  const spin = (await u.call('POST', `/events/${ev.id}/spin`)).data;
  const spin2 = (await u.call('POST', `/events/${ev.id}/spin`)).data;
  check('рулетка не перекручивается', spin.id === spin2.id && spin2.already, [spin, spin2]);
  check('9 пиков вместо 8 — отказ', (await u.call('PUT', `/events/${ev.id}/card`, { picks: ch.picks.slice(0, 9).map((p) => p.id) })).status === 400);
  check('дубликаты id — отказ', (await u.call('PUT', `/events/${ev.id}/card`, { picks: Array(8).fill(ch.picks[0].id) })).status === 400);
  const chosen = ch.picks.slice(0, 8);
  check('карточка сохранена', (await u.call('PUT', `/events/${ev.id}/card`, { picks: chosen.map((p) => p.id) })).status === 200);

  const det = (await admin.call('GET', `/admin/events/${ev.id}`)).data;
  await admin.call('PUT', `/admin/events/${ev.id}/results`, {
    picks: det.picks.map((p) => ({ id: p.id, result: 'correct', explanation: 'сбылось' })),
    people: det.people.map((p) => ({ id: p.id, points: 20 }))
  });
  const open = (await u.call('GET', `/events/${ev.id}`)).data;
  check('пока открыто — результатов нет', open.cards.every((c) => c.result === null) && open.person.points === null && open.board.length === 0, open);
  check('юзер не админ', (await u.call('GET', '/admin/events')).status === 403);

  await admin.call('PUT', `/admin/events/${ev.id}/status`, { status: 'closed' });
  const closed = (await u.call('GET', `/events/${ev.id}`)).data;
  const expected = chosen.reduce((s, p) => s + p.points, 0) + 20;
  check('после закрытия очки верны', closed.me && closed.me.score === expected && closed.me.rank === 1, { closed, expected });
  check('choose после закрытия — 403', (await u.call('GET', `/events/${ev.id}/choose`)).status === 403);
  const lb = (await u.call('GET', '/leaderboard')).data;
  check('общий рейтинг содержит игрока', lb.some((r) => r.username === name && r.score >= expected), lb);
  const exp = await admin.call('GET', `/admin/events/${ev.id}/export`);
  check('экспорт', exp.data.picks.length === 10 && exp.data.people.length === 2);
  await admin.call('DELETE', `/admin/events/${ev.id}`);
  console.log(failed ? `\nПровалено: ${failed}` : '\nВсе проверки пройдены'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
