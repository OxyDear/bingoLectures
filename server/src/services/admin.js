const events = require('../repositories/events');
const { tx } = require('../db/pool');
const { requireEvent } = require('./cards');
const { parseImport, summarize } = require('./importer');
const { ALLOWED_POINTS, MAX_IMPORT, MAX_PERSON_POINTS, LIMITS, toInt } = require('../domain/rules');
const { badRequest } = require('../errors');

const str = (v, max) => String(v ?? '').trim().slice(0, max);

async function eventDetails(id) {
  const ev = await requireEvent(id);
  const [picks, people] = await Promise.all([events.picks(ev.id), events.people(ev.id)]);
  return { event: ev, picks, people };
}

async function addPick(eventId, body) {
  const ev = await requireEvent(eventId);
  const title = str(body.title, LIMITS.pickTitle);
  const points = toInt(body.points);
  if (!title) throw badRequest('Введите текст пика');
  if (!ALLOWED_POINTS.includes(points)) throw badRequest(`Очки могут быть только ${ALLOWED_POINTS.join(', ')}`);
  await events.addPick(ev.id, { title, points, category: str(body.category, LIMITS.category) });
}

async function addPerson(eventId, body) {
  const ev = await requireEvent(eventId);
  const name = str(body.name, LIMITS.personName);
  if (!name) throw badRequest('Введите имя');
  if ((await events.people(ev.id)).some((x) => x.name.toLowerCase() === name.toLowerCase())) throw badRequest('Такой человек уже добавлен');
  await events.addPerson(ev.id, name);
}

async function saveResults(eventId, body) {
  const ev = await requireEvent(eventId);
  const picks = Array.isArray(body.picks) ? body.picks : [];
  const people = Array.isArray(body.people) ? body.people : [];
  const peopleRows = people.map((p) => {
    const raw = p.points === null || p.points === undefined ? '' : String(p.points).trim();
    if (raw === '') return { id: toInt(p.id), points: null };
    if (!/^\d{1,3}$/.test(raw) || Number(raw) > MAX_PERSON_POINTS) throw badRequest(`Очки за человека: целое число от 0 до ${MAX_PERSON_POINTS}`);
    return { id: toInt(p.id), points: Number(raw) };
  });
  const pickRows = picks.map((p) => ({
    id: toInt(p.id),
    result: ['correct', 'incorrect'].includes(p.result) ? p.result : null,
    explanation: str(p.explanation, LIMITS.explanation)
  }));
  await tx(async (db) => {
    if (pickRows.length) await events.setPickResults(ev.id, pickRows, db);
    if (peopleRows.length) await events.setPersonPoints(ev.id, peopleRows, db);
  });
}

async function exportEvent(eventId) {
  const { event, picks, people } = await eventDetails(eventId);
  return {
    event: event.title,
    picks: picks.map((p) => ({ title: p.title, category: p.category, points: p.points, result: p.result, explanation: p.explanation })),
    people: people.map((x) => ({ name: x.name, points: x.points }))
  };
}

async function importEvent(eventId, { json, replace }) {
  const ev = await requireEvent(eventId);
  const result = await tx(async (db) => {
    const seenTitles = new Set(), seenNames = new Set();
    if (!replace) {
      (await events.picks(ev.id, db)).forEach((r) => seenTitles.add(r.title.toLowerCase()));
      (await events.people(ev.id, db)).forEach((r) => seenNames.add(r.name.toLowerCase()));
    }
    const parsed = parseImport(json, { seenTitles, seenNames });
    if (parsed.picks.length > MAX_IMPORT || parsed.people.length > MAX_IMPORT) throw badRequest(`Слишком много записей за раз (максимум ${MAX_IMPORT})`);
    if (replace) {
      await events.clearPicks(ev.id, db);
      if (parsed.hasPeople) await events.clearPeople(ev.id, db);
    }
    for (const p of parsed.picks) await events.addPick(ev.id, p, db);
    for (const x of parsed.people) await events.addPerson(ev.id, x.name, x.points, db);
    return parsed;
  });
  return { ok: result.stats.picks + result.stats.people > 0, message: summarize(result) };
}

module.exports = { eventDetails, addPick, addPerson, saveResults, exportEvent, importEvent };
