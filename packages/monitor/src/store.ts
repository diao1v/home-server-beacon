import type { MetricsSnapshot } from '@homelab/shared';
import { sqlite } from './db/client.js';
import { env } from './env.js';
import { logger } from './logger.js';

const insertStmt = sqlite.prepare(
  `INSERT INTO snapshots
     (server_id, timestamp, cpu_percent, mem_percent, disk_percent, raw_json)
   VALUES (?, ?, ?, ?, ?, ?)`,
);

const cleanupStmt = sqlite.prepare('DELETE FROM snapshots WHERE timestamp < ?');

const historyStmt = sqlite.prepare(
  `SELECT timestamp, cpu_percent AS cpu, mem_percent AS mem, disk_percent AS disk
   FROM snapshots
   WHERE server_id = ? AND timestamp >= ?
   ORDER BY timestamp ASC`,
);

export interface HistoryRow {
  timestamp: number;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
}

export function writeSnapshot(serverId: string, snap: MetricsSnapshot): void {
  const primaryDisk = snap.os.disks[0];
  insertStmt.run(
    serverId,
    Date.now(),
    snap.os.cpuPercent,
    snap.os.memory.usedPercent,
    primaryDisk?.usedPercent ?? null,
    JSON.stringify(snap),
  );
}

export function getHistory(serverId: string, sinceMs: number): HistoryRow[] {
  return historyStmt.all(serverId, sinceMs) as HistoryRow[];
}

let cleanupTimer: NodeJS.Timeout | null = null;

function runCleanup(): void {
  const cutoff = Date.now() - env.HISTORY_RETENTION_HOURS * 60 * 60 * 1000;
  const result = cleanupStmt.run(cutoff);
  if (result.changes > 0) {
    logger.info({ removed: result.changes }, 'history retention cleanup');
  }
}

export function startCleanupJob(): void {
  if (cleanupTimer) return;
  // Run once at startup so a long-stopped monitor doesn't accumulate gaps that
  // grow the file unexpectedly on next boot.
  runCleanup();
  cleanupTimer = setInterval(runCleanup, 60 * 60 * 1000);
  cleanupTimer.unref();
}

export function stopCleanupJob(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
