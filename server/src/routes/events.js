const router = require('express').Router();
const events = require('../repositories/events');
const cards = require('../repositories/cards');
const svc = require('../services/cards');
const { wrap, needUser } = require('../middleware/http');
const { withRanks } = require('../domain/rules');

router.use(needUser);

router.get('/events', wrap(async (req, res) => res.json(await events.listForUser(req.user.id))));
router.get('/leaderboard', wrap(async (req, res) => res.json(withRanks(await cards.globalBoard()))));
router.get('/events/:id', wrap(async (req, res) => res.json(await svc.eventView(req.params.id, req.user.id))));
router.get('/events/:id/choose', wrap(async (req, res) => res.json(await svc.chooseView(req.params.id, req.user.id))));
router.post('/events/:id/spin', wrap(async (req, res) => res.json(await svc.spin(req.params.id, req.user.id))));
router.put('/events/:id/card', wrap(async (req, res) => {
  await svc.saveCard(req.params.id, req.user.id, req.body.picks);
  res.json({ ok: true });
}));

module.exports = router;
