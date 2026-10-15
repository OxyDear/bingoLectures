-- Единственное место, где определено «сколько очков у игрока в событии».
-- Раньше эта формула была скопирована в двух больших SQL-запросах (событие и общий рейтинг).
CREATE OR REPLACE VIEW card_scores AS
SELECT c.user_id, c.event_id,
  (COALESCE(SUM(p.points) FILTER (WHERE p.result = 'correct'), 0)
   + COALESCE((SELECT pe.points FROM card_person cp JOIN people pe ON pe.id = cp.person_id
               WHERE cp.user_id = c.user_id AND cp.event_id = c.event_id), 0))::int AS score
FROM card_picks c
JOIN picks p ON p.id = c.pick_id
GROUP BY c.user_id, c.event_id;
