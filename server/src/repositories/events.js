const { query } = require('../db/pool');
const { toInt } = require('../domain/rules');

// db — pool или клиент транзакции
const run = (db, text, params) => (db ? db.query(text, params) : query(text, params));

exports.get = async (id) => {
  const n = toInt(id);
  return n === null ? null : (await query('SELECT * FROM events WHERE id=$1', [n])).rows[0] || null;
};

exports.listForUser = async (userId) => (await query(`
  SELECT e.*, (SELECT count(*)::int FROM picks p WHERE p.event_id=e.id) AS total,
    (SELECT count(*)::int FROM card_picks c WHERE c.event_id=e.id AND c.user_id=$1) AS mine
  FROM events e ORDER BY e.created_at DESC`, [userId])).rows;

exports.listAdmin = async () => (await query(`
  SELECT e.*, (SELECT count(*)::int FROM picks p WHERE p.event_id=e.id) AS total
  FROM events e ORDER BY e.created_at DESC`)).rows;

exports.create = async (title) => (await query('INSERT INTO events (title) VALUES ($1) RETURNING *', [title])).rows[0];
exports.setStatus = async (id, status) =>
  (await query('UPDATE events SET status=$2 WHERE id=$1 RETURNING *', [id, status])).rows[0] || null;
exports.remove = (id) => query('DELETE FROM events WHERE id=$1', [id]);

// ----- пики -----
exports.picks = async (eventId, db) => (await run(db, 'SELECT * FROM picks WHERE event_id=$1 ORDER BY id', [eventId])).rows;
exports.addPick = (eventId, { title, category, points, result = null, explanation = '' }, db) =>
  run(db, 'INSERT INTO picks (event_id, title, category, points, result, explanation) VALUES ($1,$2,$3,$4,$5,$6)',
    [eventId, title, category, points, result, explanation]);
exports.removePick = async (id) =>
  (await query('DELETE FROM picks WHERE id=$1 RETURNING event_id', [id])).rows[0] || null;
exports.clearPicks = (eventId, db) => run(db, 'DELETE FROM picks WHERE event_id=$1', [eventId]);

// Результаты одним запросом вместо UPDATE на каждый пик
exports.setPickResults = (eventId, rows, db) => run(db, `
  UPDATE picks p SET result=v.result, explanation=v.expl
  FROM unnest($1::int[], $2::text[], $3::text[]) AS v(id, result, expl)
  WHERE p.id=v.id AND p.event_id=$4`,
  [rows.map((r) => r.id), rows.map((r) => r.result), rows.map((r) => r.explanation), eventId]);

// ----- люди для рулетки -----
exports.people = async (eventId, db) => (await run(db, 'SELECT * FROM people WHERE event_id=$1 ORDER BY id', [eventId])).rows;
exports.addPerson = (eventId, name, points = null, db) =>
  run(db, 'INSERT INTO people (event_id, name, points) VALUES ($1,$2,$3)', [eventId, name, points]);
exports.removePerson = async (id) =>
  (await query('DELETE FROM people WHERE id=$1 RETURNING event_id', [id])).rows[0] || null;
exports.clearPeople = (eventId, db) => run(db, 'DELETE FROM people WHERE event_id=$1', [eventId]);
exports.setPersonPoints = (eventId, rows, db) => run(db, `
  UPDATE people pe SET points=v.points
  FROM unnest($1::int[], $2::int[]) AS v(id, points)
  WHERE pe.id=v.id AND pe.event_id=$3`,
  [rows.map((r) => r.id), rows.map((r) => r.points), eventId]);
