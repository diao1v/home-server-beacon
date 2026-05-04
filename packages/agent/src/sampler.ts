import type { DockerMetrics, OsMetrics, Pm2Metrics } from '@homelab/shared';
import { collectDocker } from './collectors/docker.js';
import { collectOs } from './collectors/os.js';
import { collectPm2 } from './collectors/pm2.js';
import { env } from './env.js';
import { logger } from './logger.js';

interface SamplerState {
  os: OsMetrics | null;
  docker: DockerMetrics | null;
  pm2: Pm2Metrics | null;
  lastUpdate: number;
}

const state: SamplerState = {
  os: null,
  docker: null,
  pm2: null,
  lastUpdate: 0,
};

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  const start = Date.now();

  const [osResult, dockerResult, pm2Result] = await Promise.allSettled([
    collectOs(),
    env.ENABLE_DOCKER ? collectDocker() : Promise.resolve(null),
    env.ENABLE_PM2 ? collectPm2() : Promise.resolve(null),
  ]);

  if (osResult.status === 'fulfilled') {
    state.os = osResult.value;
  } else {
    logger.warn({ err: osResult.reason }, 'os collector failed');
  }

  if (dockerResult.status === 'fulfilled') {
    state.docker = dockerResult.value;
  } else {
    logger.warn({ err: dockerResult.reason }, 'docker collector failed');
    state.docker = null;
  }

  if (pm2Result.status === 'fulfilled') {
    state.pm2 = pm2Result.value;
  } else {
    logger.warn({ err: pm2Result.reason }, 'pm2 collector failed');
    state.pm2 = null;
  }

  state.lastUpdate = Date.now();
  logger.debug({ durationMs: state.lastUpdate - start }, 'sampler tick complete');
}

export function startSampler(): void {
  if (timer) return;
  // Fire immediately so /metrics has data as soon as possible.
  tick().catch((err) => logger.error({ err }, 'initial sampler tick threw'));
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'sampler tick threw'));
  }, env.SAMPLE_INTERVAL_MS);
  // Don't keep the event loop alive solely for the sampler.
  timer.unref();
}

export function stopSampler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getSnapshot(): Readonly<SamplerState> {
  return state;
}
