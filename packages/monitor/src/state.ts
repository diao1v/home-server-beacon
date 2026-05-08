import { EventEmitter } from 'node:events';
import type { MetricsSnapshot } from '@homelab/shared';
import { logger } from './logger.js';

export type ServerStatus = 'online' | 'degraded' | 'offline';

export interface ServerState {
  id: string;
  displayName: string;
  ledName?: string;
  status: ServerStatus;
  lastSeen: number | null;
  consecutiveFailures: number;
  latestSnapshot: MetricsSnapshot | null;
  lastError: string | null;
}

export interface ServerInit {
  id: string;
  displayName: string;
  ledName?: string;
}

export interface StateEvents {
  change: (state: ServerState) => void;
  offline: (state: ServerState) => void;
  recovered: (state: ServerState) => void;
}

const FAILURE_THRESHOLD = 3;

class StateStore extends EventEmitter {
  private servers = new Map<string, ServerState>();

  init(servers: ServerInit[]): void {
    for (const s of servers) {
      this.servers.set(s.id, {
        id: s.id,
        displayName: s.displayName,
        ledName: s.ledName,
        status: 'offline',
        lastSeen: null,
        consecutiveFailures: 0,
        latestSnapshot: null,
        lastError: null,
      });
    }
  }

  recordSuccess(id: string, snapshot: MetricsSnapshot): void {
    const s = this.servers.get(id);
    if (!s) return;
    // "Recovered" = was previously online and went offline. The first successful poll
    // of a freshly-started monitor (lastSeen === null) is just "first contact".
    const wasOffline = s.status === 'offline' && s.lastSeen !== null;
    s.status = 'online';
    s.lastSeen = Date.now();
    s.consecutiveFailures = 0;
    s.latestSnapshot = snapshot;
    s.lastError = null;
    if (wasOffline) {
      logger.info({ serverId: id }, 'server recovered');
      this.emit('recovered', s);
    }
    this.emit('change', s);
  }

  recordFailure(id: string, err: unknown): void {
    const s = this.servers.get(id);
    if (!s) return;
    s.consecutiveFailures += 1;
    s.lastError = err instanceof Error ? err.message : String(err);
    if (s.consecutiveFailures >= FAILURE_THRESHOLD) {
      if (s.status !== 'offline') {
        s.status = 'offline';
        logger.warn(
          { serverId: id, failures: s.consecutiveFailures, error: s.lastError },
          'server offline',
        );
        this.emit('offline', s);
      }
    } else if (s.status !== 'offline') {
      s.status = 'degraded';
    }
    this.emit('change', s);
  }

  get(id: string): ServerState | undefined {
    return this.servers.get(id);
  }

  all(): ServerState[] {
    return [...this.servers.values()];
  }
}

export const state = new StateStore();
