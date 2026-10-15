const crypto = require('crypto');
const events = require('../repositories/events');
const cards = require('../repositories/cards');
const { tx } = require('../db/pool');
const { regularSlots, needRegular, withRanks, toInt } = require('../domain/rules');
const { HttpError, badRequest, notFound } = require('../errors');

async function requireEvent(id) {
  const ev = await events.get(id);
  if (!ev) throw notFound('Событие не найдено');
  return ev;
}
const publicEvent = (ev) => ({ id: ev.id, title: ev.title, status: ev.status });

// Страница карточки. Пока приём открыт, результаты и очки НЕ покидают сервер вообще.
async function eventView(eventId, userId) {
  const ev = await requireEvent(eventId);
  const closed = ev.status === 'closed';
  const [picks, mine, people, person] = await Promise.all([
    events.picks(ev.id), cards.myPickIds(ev.id, userId), events.people(ev.id), cards.myPerson(ev.id, userId)
  ]);
  const mineSet = new Set(mine);
  const myCards = picks.filter((p) => mineSet.has(p.id)).map((p) => ({
    id: p.id, title: p.title, category: p.category, points: p.points,
    result: closed ? p.result : null, explanation: closed ? p.explanation : ''
  }));
  const view = {
    event: publicEvent(ev), hasCard: mine.length > 0, hasPeople: people.length > 0,
    slots: regularSlots(people.length > 0), cards: myCards,
    person: person && { id: person.id, name: person.name, points: closed ? person.points : null },
    board: [], me: null
  };
  if (closed) {
    view.board = withRanks(await cards.eventBoard(ev.id));
    const me = view.board.find((r) => r.id === userId);
    view.me = me ? { rank: me.rank, score: me.score, top: Math.ceil((me.rank / view.board.length) * 100) } : null;
  }
  return view;
}

// Данные для выбора пиков. Результаты сюда не попадают (поля перечислены явно).
async function chooseView(eventId, userId) {
  const ev = await requireEvent(eventId);
  if (ev.status !== 'open') throw new HttpError(403, 'Приём карточек закрыт');
  const [picks, people, person, mine] = await Promise.all([
    events.picks(ev.id), events.people(ev.id), cards.myPerson(ev.id, userId), cards.myPickIds(ev.id, userId)
  ]);
  return {
    event: publicEvent(ev),
    picks: picks.map((p) => ({ id: p.id, title: p.title, category: p.category, points: p.points })),
    people: people.map((p) => p.name),
    spunIndex: person ? people.findIndex((p) => p.id === person.id) : -1,
    mine, need: needRegular(picks.length, people.length > 0)
  };
}

// Рулетка: результат выбирается на сервере и сохраняется — перекрутить нельзя
async function spin(eventId, userId) {
  const ev = await requireEvent(eventId);
  if (ev.status !== 'open') throw new HttpError(403, 'Приём карточек закрыт');
  const people = await events.people(ev.id);
  if (!people.length) throw badRequest('В этом событии нет людей для рулетки');

  let person = await cards.myPerson(ev.id, userId);
  let already = Boolean(person);
  if (!person) {
    const winner = people[crypto.randomInt(people.length)];
    const assigned = await cards.assignPerson(userId, ev.id, winner.id);
    person = assigned ? winner : await cards.myPerson(ev.id, userId);
    already = !assigned;
  }
  return { id: person.id, name: person.name, index: people.findIndex((x) => x.id === person.id), already };
}

async function saveCard(eventId, userId, rawIds) {
  const ev = await requireEvent(eventId);
  if (ev.status !== 'open') throw new HttpError(403, 'Приём карточек закрыт');
  const ids = [...new Set([].concat(rawIds || []).map(toInt))];
  const [picks, people] = await Promise.all([events.picks(ev.id), events.people(ev.id)]);
  const hasPeople = people.length > 0;
  const need = needRegular(picks.length, hasPeople);
  const valid = ids.every((n) => n !== null) ? await cards.validPickIds(ev.id, ids) : [];
  if (!picks.length || valid.length !== ids.length || ids.length !== need) throw badRequest(`Выберите ровно ${need} пиков`);
  if (hasPeople && !(await cards.myPerson(ev.id, userId)))
    throw badRequest('Сначала прокрутите рулетку — «Пик на человека» входит в вашу карточку');
  await tx((db) => cards.replace(db, ev.id, userId, ids));
}

module.exports = { eventView, chooseView, spin, saveCard, requireEvent };
