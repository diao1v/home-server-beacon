import { EventEmitter } from 'node:events';
import { MetricsSnapshot, type ServerEntry } from '@homelab/shared';
import { env } from './env.js';
import { logger } from './logger.js';
import { state } from './state.js';
import { writeSnapshot } from './store.js';

/**
 * Emits 'cycle' after each poll cycle completes (success or failure of individual
 * servers does not block the event). Subscribers (e.g. WS broadcaster) use this
 * to push the latest aggregate state to clients.
 */
export const pollerEvents = new EventEmitter();

let timer: NodeJS.Timeout | null = null;

async function pollOne(server: ServerEntry): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), env.POLL_TIMEOUT_MS);
  try {
    const res = await fetch(`${server.url}/metrics`, {
      headers: { Authorization: `Bearer ${server.apiKey}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const parsed = MetricsSnapshot.parse(json);
    state.recordSuccess(server.id, parsed);
    writeSnapshot(server.id, parsed);
  } catch (err) {
    state.recordFailure(server.id, err);
  } finally {
    clearTimeout(t);
  }
}

export function startPoller(servers: readonly ServerEntry[]): void {
  if (timer) return;
  const tick = async () => {
    const start = Date.now();
    await Promise.allSettled(servers.map((s) => pollOne(s)));
    logger.debug({ durationMs: Date.now() - start }, 'poll cycle complete');
    pollerEvents.emit('cycle');
  };
  // Fire immediately so the dashboard has data ASAP.
  tick().catch((err) => logger.error({ err }, 'initial poll cycle threw'));
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, 'poll cycle threw'));
  }, env.POLL_INTERVAL_MS);
  timer.unref();
}

export function stopPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
