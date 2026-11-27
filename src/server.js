// Server entry point (spec §7). Dashboard router wired in by the orchestrator after the worker merges (plan T4).
import { createStore } from './store.js';
import { createApp } from './app.js';
import { createDashboardRouter } from './dashboard/routes.js';

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? './data/neon-coast.db';

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Invalid PORT '${process.env.PORT}': use a whole number from 0 to 65535.`);
  process.exit(1);
}

const store = createStore(dbPath);
const dashboardRouter = createDashboardRouter({
  getDashboard: (playerId) => store.getDashboard(playerId),
  listPlayerSummaries: () => store.listPlayerSummaries(),
  submitEvent: (body) => store.submitEvent(body),
});
const app = createApp({ store, dashboardRouter });

const server = app.listen(port, (err) => {
  if (err) {
    console.error(`Could not start the server: ${err.message}`);
    store.close();
    process.exit(1);
  }
  console.log(`Neon Coast tracker listening on http://localhost:${server.address().port} (db: ${dbPath})`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down.`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  // Drop keep-alive connections that would otherwise hold close() open.
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
