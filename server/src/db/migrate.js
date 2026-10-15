const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

const DIR = path.join(__dirname, 'migrations');

// Минимальный раннер: применяет *.sql по порядку имён, каждый файл один раз.
// Advisory lock защищает от гонки, если запустилось несколько экземпляров.
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(DIR, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('Миграция применена:', file);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Миграция ${file} не применена: ${e.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

module.exports = { migrate };
