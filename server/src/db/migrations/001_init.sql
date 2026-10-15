-- Исходная схема. IF NOT EXISTS — чтобы миграция безопасно прошла и на уже работающей базе.
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
);
