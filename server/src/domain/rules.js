// Единственный источник правил игры. Клиент получает их через GET /api/me,
// поэтому изменение очков или размера карточки делается только здесь.
const TIERS = [
  { points: 1, name: 'безопасные' },
  { points: 3, name: 'вероятные' },
  { points: 5, name: 'маловероятные' },
  { points: 10, name: 'невозможно', hot: true }
];
const ALLOWED_POINTS = TIERS.map((t) => t.points);
const DEFAULT_POINTS = 3;
const CARD_SIZE = 9; // в карточке 9 ячеек; одна из них занята «Пиком на человека», если в событии есть люди
const MAX_PERSON_POINTS = 100;
const MAX_IMPORT = 500;
const LIMITS = { eventTitle: 120, pickTitle: 200, category: 40, explanation: 300, personName: 60 };

const regularSlots = (hasPeople) => (hasPeople ? CARD_SIZE - 1 : CARD_SIZE);
const needRegular = (total, hasPeople) => Math.min(regularSlots(hasPeople), total);

// Ранжирование «с общими местами»; rows должны быть отсортированы по score по убыванию
function withRanks(rows) {
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.score !== rows[i - 1].score) rank = i + 1;
    return { ...r, rank };
  });
}

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};

const parsePoints = (v) => {
  if (v === undefined || v === null || v === '') return DEFAULT_POINTS;
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Number(v);
  return ALLOWED_POINTS.includes(n) ? n : null;
};

module.exports = {
  TIERS, ALLOWED_POINTS, DEFAULT_POINTS, CARD_SIZE, MAX_PERSON_POINTS, MAX_IMPORT, LIMITS,
  regularSlots, needRegular, withRanks, toInt, parsePoints
};
