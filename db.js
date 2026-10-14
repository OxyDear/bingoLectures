const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS picks (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  points INT NOT NULL DEFAULT 3,
  result TEXT CHECK (result IN ('correct','incorrect')),
  explanation TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS card_picks (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pick_id INT NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, pick_id)
);
CREATE TABLE IF NOT EXISTS people (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  points INT CHECK (points IS NULL OR points BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS card_person (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, event_id)
);`;

// Очки пиков: только 1, 3, 5, 10. Старые «нестандартные» значения приводим к ближайшему допустимому.
const MIGRATE = `
UPDATE picks SET points = CASE WHEN points <= 2 THEN 1 WHEN points <= 4 THEN 3 WHEN points <= 7 THEN 5 ELSE 10 END
  WHERE points NOT IN (1,3,5,10);
ALTER TABLE picks DROP CONSTRAINT IF EXISTS picks_points_allowed;
ALTER TABLE picks ADD CONSTRAINT picks_points_allowed CHECK (points IN (1,3,5,10));`;

async function init() {
  await pool.query(SCHEMA);
  await pool.query(MIGRATE);
  const { ADMIN_USERNAME: u, ADMIN_PASSWORD: p } = process.env;
  const has = await pool.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1");
  if (!has.rowCount && u && p) {
    await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1,$2,'admin') ON CONFLICT (username) DO NOTHING",
      [u, await bcrypt.hash(p, 12)]
    );
    console.log('Создан администратор:', u);
  }
}
module.exports = { pool, init };
