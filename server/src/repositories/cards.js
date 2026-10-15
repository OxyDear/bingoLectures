const { query } = require('../db/pool');

exports.myPickIds = async (eventId, userId) =>
  (await query('SELECT pick_id FROM card_picks WHERE event_id=$1 AND user_id=$2', [eventId, userId])).rows.map((r) => r.pick_id);

exports.myPerson = async (eventId, userId) => (await query(
  `SELECT p.* FROM card_person c JOIN people p ON p.id=c.person_id WHERE c.event_id=$1 AND c.user_id=$2`,
  [eventId, userId])).rows[0] || null;

exports.validPickIds = async (eventId, ids) =>
  (await query('SELECT id FROM picks WHERE event_id=$1 AND id=ANY($2::int[])', [eventId, ids])).rows.map((r) => r.id);

// Карточка заменяется целиком (вызывать внутри транзакции)
exports.replace = async (db, eventId, userId, pickIds) => {
  await db.query('DELETE FROM card_picks WHERE event_id=$1 AND user_id=$2', [eventId, userId]);
  await db.query('INSERT INTO card_picks (user_id, pick_id, event_id) SELECT $1, unnest($3::int[]), $2', [userId, eventId, pickIds]);
};

// true — человек назначен сейчас; false — у игрока уже был результат рулетки
exports.assignPerson = async (userId, eventId, personId) => (await query(
  'INSERT INTO card_person (user_id, event_id, person_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
  [userId, eventId, personId])).rowCount > 0;

// Таблицы лидеров строятся на view card_scores (миграция 003)
exports.eventBoard = async (eventId) => (await query(`
  SELECT u.id, u.username, s.score FROM card_scores s JOIN users u ON u.id=s.user_id
  WHERE s.event_id=$1 ORDER BY s.score DESC, u.username`, [eventId])).rows;

exports.globalBoard = async () => (await query(`
  SELECT u.id, u.username, SUM(s.score)::int AS score, COUNT(*)::int AS events
  FROM card_scores s
  JOIN events e ON e.id=s.event_id AND e.status='closed'
  JOIN users u ON u.id=s.user_id
  GROUP BY u.id, u.username ORDER BY score DESC, u.username`)).rows;
