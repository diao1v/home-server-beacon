import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { MetricsSnapshot } from '@homelab/shared';
import { Hono } from 'hono';
import { bearerAuth } from './auth.js';
import { disconnectPm2 } from './collectors/pm2.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { getSnapshot, startSampler, stopSampler } from './sampler.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as {
  version: string;
};

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));

app.use('/metrics', bearerAuth);
app.get('/metrics', (c) => {
  const snap = getSnapshot();
  if (!snap.os) {
    return c.json({ error: 'sampler warming up' }, 503);
  }
  const payload = {
    meta: {
      hostname: hostname(),
      serverId: env.SERVER_ID,
      version: pkg.version,
      timestamp: new Date().toISOString(),
    },
    os: snap.os,
    docker: snap.docker,
    pm2: snap.pm2,
  };
  const result = MetricsSnapshot.safeParse(payload);
  if (!result.success) {
    logger.error({ issues: result.error.issues }, 'metrics shape validation failed');
    return c.json({ error: 'internal validation error' }, 500);
  }
  return c.json(result.data);
});

startSampler();

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
        enableDocker: env.ENABLE_DOCKER,
        enablePm2: env.ENABLE_PM2,
        version: pkg.version,
      },
      'agent listening',
    );
  },
);

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  stopSampler();
  disconnectPm2();
  server.close(() => process.exit(0));
  // Hard fail-safe
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
