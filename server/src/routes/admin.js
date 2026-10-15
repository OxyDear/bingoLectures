const router = require('express').Router();
const events = require('../repositories/events');
const svc = require('../services/admin');
const { requireEvent } = require('../services/cards');
const { wrap, needAdmin } = require('../middleware/http');
const { badRequest, notFound } = require('../errors');
const { toInt, LIMITS } = require('../domain/rules');

router.use(needAdmin);
const ok = (res) => res.json({ ok: true });

router.get('/events', wrap(async (req, res) => res.json(await events.listAdmin())));
router.post('/events', wrap(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, LIMITS.eventTitle);
  if (!title) throw badRequest('Введите название события');
  res.status(201).json(await events.create(title));
}));
router.get('/events/:id', wrap(async (req, res) => res.json(await svc.eventDetails(req.params.id))));
router.delete('/events/:id', wrap(async (req, res) => { await events.remove(toInt(req.params.id)); ok(res); }));

router.put('/events/:id/status', wrap(async (req, res) => {
  const ev = await requireEvent(req.params.id);
  if (!['open', 'closed'].includes(req.body.status)) throw badRequest('Некорректный статус');
  res.json(await events.setStatus(ev.id, req.body.status));
}));

router.post('/events/:id/picks', wrap(async (req, res) => { await svc.addPick(req.params.id, req.body); ok(res); }));
router.delete('/picks/:id', wrap(async (req, res) => {
  if (!(await events.removePick(toInt(req.params.id)))) throw notFound();
  ok(res);
}));
router.post('/events/:id/people', wrap(async (req, res) => { await svc.addPerson(req.params.id, req.body); ok(res); }));
router.delete('/people/:id', wrap(async (req, res) => {
  if (!(await events.removePerson(toInt(req.params.id)))) throw notFound();
  ok(res);
}));

router.put('/events/:id/results', wrap(async (req, res) => { await svc.saveResults(req.params.id, req.body); ok(res); }));

router.get('/events/:id/export', wrap(async (req, res) => {
  const data = await svc.exportEvent(req.params.id);
  res.attachment(`picks-event-${req.params.id}.json`).type('application/json').send(JSON.stringify(data, null, 2));
}));
router.post('/events/:id/import', wrap(async (req, res) => {
  res.json(await svc.importEvent(req.params.id, { json: req.body.json, replace: req.body.replace === true }));
}));

module.exports = router;
