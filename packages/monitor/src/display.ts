import { createHash } from 'node:crypto';
import type { DiskInfo, NetworkInfo } from '@homelab/shared';
import type { ServerState } from './state.js';

/**
 * Compact, integer-only state shape for low-resource clients (LED panels, ESP32 etc.).
 * Names are short, status is a 3-letter enum, all percentages are rounded ints.
 */

export interface DisplayServer {
  id: string;
  name: string;
  s: 'ok' | 'warn' | 'err';
  cpu: number;
  ram: number;
  disk: number;
  rx: number; // bytes/sec
  tx: number; // bytes/sec
}

export interface DisplayFleet {
  online: number;
  degraded: number;
  offline: number;
  cpu: number;
  ram: number;
  rx: number;
  tx: number;
}

export interface DisplayPayload {
  ts: number;
  fleet: DisplayFleet;
  servers: DisplayServer[];
}

// Interfaces we never want to count as "internet" traffic.
const SKIP_IFACE_PREFIXES = ['lo', 'docker', 'br-', 'veth'];

export function primaryNetwork(network: NetworkInfo[]): { rx: number; tx: number } {
  const real = network.filter(
    (n) => !SKIP_IFACE_PREFIXES.some((p) => n.iface.startsWith(p)),
  );
  if (real.length === 0) return { rx: 0, tx: 0 };
  // The interface with the most cumulative rx is almost always the primary WAN-facing NIC.
  const primary = real.reduce((max, n) => (n.rxBytes > max.rxBytes ? n : max));
  return { rx: primary.rxRate, tx: primary.txRate };
}

function shortStatus(status: ServerState['status']): DisplayServer['s'] {
  if (status === 'online') return 'ok';
  if (status === 'degraded') return 'warn';
  return 'err';
}

/**
 * Combined disk usage across every disk on the host: sum(used) / sum(total).
 * For multi-disk hosts this answers "how full is this server's storage overall"
 * rather than "what's the largest disk's percentage." Returns null when there
 * are no disks reported (the API caller will then see 0).
 */
function combinedDiskPercent(disks: DiskInfo[]): number | null {
  if (disks.length === 0) return null;
  let total = 0;
  let used = 0;
  for (const d of disks) {
    total += d.total;
    used += d.used;
  }
  if (total <= 0) return null;
  return (used / total) * 100;
}

function intOrZero(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
}

function truncate(name: string, limit: number): string {
  if (name.length <= limit) return name;
  return `${name.slice(0, Math.max(1, limit - 1))}…`;
}

export function buildDisplayPayload(
  servers: ServerState[],
  nameLimit: number,
): DisplayPayload {
  const out: DisplayServer[] = [];
  const counts = { online: 0, degraded: 0, offline: 0 };
  let cpuSum = 0;
  let ramSum = 0;
  let withSnapshot = 0;
  let rxSum = 0;
  let txSum = 0;

  for (const s of servers) {
    counts[s.status] += 1;
    const snap = s.latestSnapshot;
    const net = snap ? primaryNetwork(snap.os.network) : { rx: 0, tx: 0 };

    out.push({
      id: s.id,
      // Prefer the explicit ledName when set in servers.yaml; otherwise fall
      // back to truncating displayName so panels never see weird ellipses.
      name: s.ledName ?? truncate(s.displayName, nameLimit),
      s: shortStatus(s.status),
      cpu: intOrZero(snap?.os.cpuPercent),
      ram: intOrZero(snap?.os.memory.usedPercent),
      disk: intOrZero(snap ? combinedDiskPercent(snap.os.disks) : null),
      rx: net.rx,
      tx: net.tx,
    });

    if (snap) {
      withSnapshot += 1;
      if (typeof snap.os.cpuPercent === 'number') cpuSum += snap.os.cpuPercent;
      ramSum += snap.os.memory.usedPercent;
      rxSum += net.rx;
      txSum += net.tx;
    }
  }

  return {
    ts: Date.now(),
    fleet: {
      online: counts.online,
      degraded: counts.degraded,
      offline: counts.offline,
      cpu: withSnapshot > 0 ? Math.round(cpuSum / withSnapshot) : 0,
      ram: withSnapshot > 0 ? Math.round(ramSum / withSnapshot) : 0,
      rx: rxSum,
      tx: txSum,
    },
    servers: out,
  };
}

/**
 * Content-based ETag — derives only from the data fields, not the timestamp,
 * so an unchanged dashboard returns 304 even though `ts` ticks every call.
 */
export function computeDisplayEtag(payload: DisplayPayload): string {
  const hashable = JSON.stringify({ fleet: payload.fleet, servers: payload.servers });
  const digest = createHash('sha1').update(hashable).digest('base64').slice(0, 22);
  return `"${digest}"`;
}
