-- Допустимые очки пиков теперь определяются в коде (server/src/domain/rules.js).
-- Жёсткий CHECK в БД заставлял бы писать миграцию при каждом изменении набора очков.
ALTER TABLE picks DROP CONSTRAINT IF EXISTS picks_points_allowed;
ALTER TABLE picks DROP CONSTRAINT IF EXISTS picks_points_positive;
ALTER TABLE picks ADD CONSTRAINT picks_points_positive CHECK (points > 0);

-- Все выборки идут по event_id / (event_id, user_id), а PK этого не покрывает
CREATE INDEX IF NOT EXISTS picks_event_idx ON picks (event_id);
CREATE INDEX IF NOT EXISTS people_event_idx ON people (event_id);
CREATE INDEX IF NOT EXISTS card_picks_event_user_idx ON card_picks (event_id, user_id);
CREATE INDEX IF NOT EXISTS card_picks_pick_idx ON card_picks (pick_id);
CREATE INDEX IF NOT EXISTS card_person_person_idx ON card_person (person_id);
