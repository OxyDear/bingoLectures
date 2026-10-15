const { query } = require('../db/pool');

exports.findById = async (id) =>
  (await query('SELECT id, username, role FROM users WHERE id=$1', [id])).rows[0] || null;

exports.findByUsername = async (username) =>
  (await query('SELECT * FROM users WHERE username=$1', [username])).rows[0] || null;

exports.create = async (username, passwordHash, role = 'user') =>
  (await query('INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role',
    [username, passwordHash, role])).rows[0];

exports.hasAdmin = async () => (await query("SELECT 1 FROM users WHERE role='admin' LIMIT 1")).rowCount > 0;
