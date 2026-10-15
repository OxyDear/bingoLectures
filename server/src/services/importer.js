const { ALLOWED_POINTS, MAX_PERSON_POINTS, LIMITS, parsePoints } = require('../domain/rules');
const { badRequest } = require('../errors');

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Чистая функция: разбирает JSON-текст в нормализованные пики и людей.
// seenTitles / seenNames — уже существующие записи (для пропуска дубликатов), множества дополняются по ходу.
function parseImport(text, { seenTitles = new Set(), seenNames = new Set() } = {}) {
  let data;
  try { data = JSON.parse(String(text || '').replace(/^\uFEFF/, '')); }
  catch { throw badRequest('Не удалось прочитать JSON: проверьте формат файла'); }

  const picksList = Array.isArray(data) ? data : (isObj(data) && Array.isArray(data.picks) ? data.picks : []);
  const peopleList = isObj(data) && Array.isArray(data.people) ? data.people : null;
  if (!picksList.length && !(peopleList && peopleList.length))
    throw badRequest('В JSON не найден список пиков (нужен массив или объект с полем "picks")');

  const stats = { picks: 0, people: 0, dups: 0, invalid: 0, badPoints: 0 };
  const picks = [];
  const people = [];

  for (const raw of picksList) {
    const obj = isObj(raw) ? raw : {};
    const title = String(typeof raw === 'string' ? raw : (obj.title ?? '')).trim().slice(0, LIMITS.pickTitle);
    if (!title) { stats.invalid++; continue; }
    const points = parsePoints(obj.points);
    if (points === null) { stats.badPoints++; continue; }
    const key = title.toLowerCase();
    if (seenTitles.has(key)) { stats.dups++; continue; }
    seenTitles.add(key);
    picks.push({
      title, points,
      category: String(obj.category ?? '').trim().slice(0, LIMITS.category),
      result: ['correct', 'incorrect'].includes(obj.result) ? obj.result : null,
      explanation: String(obj.explanation ?? '').trim().slice(0, LIMITS.explanation)
    });
    stats.picks++;
  }

  for (const raw of peopleList || []) {
    const obj = isObj(raw) ? raw : {};
    const name = String(typeof raw === 'string' ? raw : (obj.name ?? '')).trim().slice(0, LIMITS.personName);
    if (!name) { stats.invalid++; continue; }
    let points = null;
    if (obj.points !== undefined && obj.points !== null && obj.points !== '') {
      const n = Number(obj.points);
      if (!Number.isInteger(n) || n < 0 || n > MAX_PERSON_POINTS) { stats.invalid++; continue; }
      points = n;
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) { stats.dups++; continue; }
    seenNames.add(key);
    people.push({ name, points });
    stats.people++;
  }
  return { picks, people, hasPeople: peopleList !== null, stats };
}

function summarize({ stats, hasPeople }) {
  const done = [`пиков: ${stats.picks}`, hasPeople && `людей: ${stats.people}`].filter(Boolean).join(', ');
  const skipped = [
    stats.dups && `дубликатов: ${stats.dups}`,
    stats.invalid && `некорректных: ${stats.invalid}`,
    stats.badPoints && `с недопустимыми очками (разрешены ${ALLOWED_POINTS.join(', ')}): ${stats.badPoints}`
  ].filter(Boolean).join(', ');
  return `Импортировано — ${done}${skipped ? `. Пропущено — ${skipped}` : ''}`;
}

module.exports = { parseImport, summarize };
