// Express router for the HTML dashboard (spec §4.5, §5).
// Depends only on two injected functions, so it can be tested with stubs.
// No catch-all route: the router is mounted at '/' and must not swallow other paths.

import express, { Router } from 'express';
import { renderIndex, renderPlayer, renderNotFound } from './render.js';
import { renderConsole, buildConsoleEvent, consoleFormFromEvent, CONSOLE_DEFAULTS } from './console.js';

const HTML = 'text/html; charset=utf-8';

/**
 * @param {{ getDashboard: Function, listPlayerSummaries: Function, submitEvent?: Function, now?: () => Date }} deps
 *   submitEvent: store.submitEvent. When given, the test console is mounted at /console.
 */
export function createDashboardRouter({ getDashboard, listPlayerSummaries, submitEvent, now = () => new Date() } = {}) {
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

  if (typeof submitEvent === 'function') {
    router.get('/console', (req, res) => {
      res.status(200).set('Content-Type', HTML).send(renderConsole({ now: now() }));
    });

    router.post('/console', express.urlencoded({ extended: false, limit: '16kb' }), async (req, res) => {
      const fields = req.body ?? {};
      const at = now();
      let request;
      if (fields.action === 'resend') {
        try {
          request = JSON.parse(String(fields.last_event ?? ''));
        } catch {
          res.status(400).set('Content-Type', HTML)
            .send(renderConsole({ error: 'Nothing to resend: send an event first.', now: at }));
          return;
        }
      } else {
        request = buildConsoleEvent(fields, { now: at });
      }
      const { httpStatus, body } = await submitEvent(request);
      // Keep the chosen selections (after a resend: the resent event's), but clear event_id and timestamp so
      // the next "Send" is a new event.
      const chosen = fields.action === 'resend' ? consoleFormFromEvent(request) : fields;
      const form = { ...CONSOLE_DEFAULTS, ...chosen, event_id: '', timestamp: '' };
      // The page itself always loads (200); the API outcome is shown on it and in data-status.
      res.status(200).set('Content-Type', HTML)
        .send(renderConsole({ form, result: { request, httpStatus, body }, now: at }));
    });
  }

  return router;
}
