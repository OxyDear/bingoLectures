const test = require('node:test');
const assert = require('node:assert');
const { withRanks, needRegular, parsePoints, regularSlots } = require('../domain/rules');
const { parseImport } = require('../services/importer');

test('withRanks: одинаковые очки делят место, следующее место пропускается', () => {
  const r = withRanks([{ score: 30 }, { score: 20 }, { score: 20 }, { score: 5 }]);
  assert.deepStrictEqual(r.map((x) => x.rank), [1, 2, 2, 4]);
});

test('needRegular: 9 пиков или 8 при рулетке, но не больше, чем есть в событии', () => {
  assert.strictEqual(needRegular(20, false), 9);
  assert.strictEqual(needRegular(20, true), 8);
  assert.strictEqual(needRegular(5, false), 5);
  assert.strictEqual(regularSlots(true), 8);
});

test('parsePoints: допустимы только очки из TIERS, по умолчанию 3', () => {
  assert.strictEqual(parsePoints(undefined), 3);
  assert.strictEqual(parsePoints('10'), 10);
  assert.strictEqual(parsePoints(7), null);
  assert.strictEqual(parsePoints({}), null);
});

test('parseImport: массив строк, дубликаты и плохие очки', () => {
  const r = parseImport(JSON.stringify(['A', 'a', { title: 'B', points: 5 }, { title: 'C', points: 4 }, '']));
  assert.deepStrictEqual(r.picks.map((p) => p.title), ['A', 'B']);
  assert.deepStrictEqual(r.stats, { picks: 2, people: 0, dups: 1, invalid: 1, badPoints: 1 });
  assert.strictEqual(r.hasPeople, false);
});

test('parseImport: учитывает уже существующие записи и BOM', () => {
  const r = parseImport('\uFEFF' + JSON.stringify({ picks: ['Старый', 'Новый'], people: [{ name: 'Аня', points: 101 }, 'Борис'] }),
    { seenTitles: new Set(['старый']) });
  assert.deepStrictEqual(r.picks.map((p) => p.title), ['Новый']);
  assert.deepStrictEqual(r.people, [{ name: 'Борис', points: null }]);
  assert.strictEqual(r.stats.invalid, 1);
});

test('parseImport: битый JSON и пустой список дают ошибку 400', () => {
  assert.throws(() => parseImport('{'), { status: 400 });
  assert.throws(() => parseImport('{"x":1}'), { status: 400 });
});
