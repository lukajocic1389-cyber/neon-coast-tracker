// Express router for the HTML dashboard (spec §4.5, §5).
// Depends only on two injected functions, so it can be tested with stubs.
// No catch-all route: the router is mounted at '/' and must not swallow other paths.

import { Router } from 'express';
import { renderIndex, renderPlayer, renderNotFound } from './render.js';

const HTML = 'text/html; charset=utf-8';

export function createDashboardRouter({ getDashboard, listPlayerSummaries, now = () => new Date() } = {}) {
  if (typeof getDashboard !== 'function' || typeof listPlayerSummaries !== 'function') {
    throw new TypeError('createDashboardRouter needs getDashboard and listPlayerSummaries functions');
  }

  const router = Router();

  router.get('/', async (req, res) => {
    const summaries = await listPlayerSummaries();
    res.status(200).set('Content-Type', HTML).send(renderIndex(summaries, { now: now() }));
  });

  router.get('/players/:player_id', async (req, res) => {
    const playerId = req.params.player_id;
    const dashboard = await getDashboard(playerId);
    if (dashboard == null) {
      res.status(404).set('Content-Type', HTML).send(renderNotFound(playerId, { now: now() }));
      return;
    }
    res.status(200).set('Content-Type', HTML).send(renderPlayer(dashboard, { now: now() }));
  });

  return router;
}
