// Express app: JSON API (spec §4) plus static assets and an optional dashboard router.
import express from 'express';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

/**
 * @param {{ store?: object, dashboardRouter?: import('express').Router }} [deps]
 *   store: the object returned by createStore(); dashboardRouter: mounted at '/' when given.
 */
export function createApp({ store, dashboardRouter } = {}) {
  const app = express();
  app.disable('x-powered-by');

  const api = express.Router();
  // strict: false lets top-level null/strings/numbers parse, so they get INVALID_BODY rather than INVALID_JSON.
  api.use(express.json({ strict: false }));

  api.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  api.get('/missions', (req, res) => {
    res.json(store.listMissions());
  });

  api.get('/players', (req, res) => {
    res.json(store.listPlayerSummaries());
  });

  api.post('/events', (req, res) => {
    const { httpStatus, body } = store.submitEvent(req.body);
    res.status(httpStatus).json(body);
  });

  api.get('/players/:player_id/dashboard', (req, res) => {
    const { player_id } = req.params;
    const dashboard = store.getDashboard(player_id);
    if (!dashboard) {
      res.status(404).json({ status: 'not_found', message: `Player '${player_id}' does not exist.` });
      return;
    }
    res.json(dashboard);
  });

  // Any other /api path is a JSON 404.
  api.use((req, res) => {
    res.status(404).json({ status: 'not_found', message: `No API route for ${req.method} ${req.originalUrl}.` });
  });

  app.use('/api', api);
  app.use('/static', express.static(PUBLIC_DIR));

  if (dashboardRouter) {
    app.use('/', dashboardRouter);
  } else {
    app.get('/', (req, res) => {
      res.json({ name: 'Neon Coast: Mission & Reputation Tracker', players: '/api/players' });
    });
  }

  // Error handler: JSON only, never a stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({
        status: 'rejected',
        errors: [{ field: 'body', code: 'INVALID_JSON', message: `Request body is not valid JSON: ${err.message}` }],
      });
      return;
    }
    if (err?.expose && Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
      // Other client errors raised by the body parser (e.g. too large, bad charset).
      res.status(err.status).json({ status: 'error', message: err.message });
      return;
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error.' });
  });

  return app;
}
