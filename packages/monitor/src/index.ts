import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadAlertsConfig, startAlerts } from './alerts/index.js';
import { loadServersConfig } from './config.js';
import { buildDisplayPayload, computeDisplayEtag } from './display.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { pollNow, startPoller, stopPoller } from './poller.js';
import { state } from './state.js';
import { getHistory, startCleanupJob, stopCleanupJob } from './store.js';
import { setupWebSocket } from './ws.js';

// Boot order: config → state → db (transitive via store) → poller → http.
const config = loadServersConfig();
state.init(config.servers.map((s) => ({ id: s.id, displayName: s.displayName })));

const app = new Hono();

const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (allowedOrigins.length > 0) {
  app.use('*', cors({ origin: allowedOrigins, credentials: true }));
  logger.info({ allowedOrigins }, 'cors enabled');
}

app.get('/health', (c) => c.json({ ok: true }));

app.get('/api/state', (c) =>
  c.json({
    timestamp: Date.now(),
    servers: state.all(),
  }),
);

// Manual refresh — triggers an immediate poll cycle. WS broadcasts the updated
// state to all clients on completion. Idempotent: concurrent requests share a
// single in-flight cycle.
app.post('/api/poll', async (c) => {
  await pollNow();
  return c.json({ ok: true });
});

app.get('/api/history/:serverId', (c) => {
  const serverId = c.req.param('serverId');
  const minutes = Number(c.req.query('minutes') ?? '30');
  const since = Date.now() - minutes * 60 * 1000;
  const rows = getHistory(serverId, since);
  return c.json({ serverId, since, rows });
});

// Compact, integer-only payload for low-resource clients (LED panels, ESP32 etc.).
// Supports If-None-Match → 304 so the embedded client can skip re-rendering on no-op polls.
//   GET /api/display              default name length 16
//   GET /api/display?names=8      truncate names to 8 chars (smaller panels)
app.get('/api/display', (c) => {
  const namesParam = Number.parseInt(c.req.query('names') ?? '', 10);
  const nameLimit = Number.isFinite(namesParam) && namesParam > 0 ? namesParam : 16;

  const payload = buildDisplayPayload(state.all(), nameLimit);
  const etag = computeDisplayEtag(payload);

  c.header('ETag', etag);
  c.header('Cache-Control', 'no-cache');

  if (c.req.header('If-None-Match') === etag) {
    return c.body(null, 304);
  }
  return c.json(payload);
});

const { injectWebSocket } = setupWebSocket(app);

// Static UI serving (last, so API routes take precedence).
const uiDistAbs = env.UI_DIST_PATH ? resolve(process.cwd(), env.UI_DIST_PATH) : null;
if (uiDistAbs && existsSync(uiDistAbs)) {
  app.use('/*', serveStatic({ root: env.UI_DIST_PATH }));
  // SPA fallback: any non-API, non-asset path returns index.html so client routing works.
  app.get(
    '*',
    serveStatic({ root: env.UI_DIST_PATH, rewriteRequestPath: () => '/index.html' }),
  );
  logger.info({ path: uiDistAbs }, 'serving UI bundle');
} else if (env.UI_DIST_PATH) {
  logger.warn(
    { path: uiDistAbs, configured: env.UI_DIST_PATH },
    'UI_DIST_PATH set but directory not found; UI not served',
  );
}

// Subscribe alerts BEFORE starting the poller so we don't miss the first
// state transitions during startup.
const alertsConfig = loadAlertsConfig();
if (alertsConfig) {
  startAlerts(alertsConfig);
}

startCleanupJob();
startPoller(config.servers);

const server = serve(
  {
    fetch: app.fetch,
    hostname: env.BIND_HOST,
    port: env.PORT,
  },
  (info) => {
    logger.info(
      {
        host: info.address,
        port: info.port,
        servers: config.servers.length,
        pollIntervalMs: env.POLL_INTERVAL_MS,
      },
      'monitor listening',
    );
  },
);

injectWebSocket(server);

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  stopPoller();
  stopCleanupJob();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
