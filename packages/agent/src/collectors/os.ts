import { execFile } from 'node:child_process';
import { loadavg, platform } from 'node:os';
import { promisify } from 'node:util';
import si from 'systeminformation';
import type { DiskInfo, OsMetrics } from '@homelab/shared';

const execFileAsync = promisify(execFile);

// Mounts to exclude from the disks array — virtual filesystems and snapshots.
const SYSTEM_FS_TYPES = new Set([
  'devfs',
  'tmpfs',
  'autofs',
  'nullfs',
  'overlay',
  'squashfs',
  'proc',
  'sysfs',
]);
const MIN_DISK_BYTES = 1 * 1024 * 1024 * 1024; // 1 GiB

const IS_MACOS = platform() === 'darwin';

function computeUsedMemory(mem: si.Systeminformation.MemData): number {
  if (IS_MACOS) {
    // Approximates Activity Monitor's "Memory Used" (wired + compressed + app memory).
    // total - available undershoots because macOS reports inactive+cached as available.
    const reclaimable = typeof mem.reclaimable === 'number' ? mem.reclaimable : 0;
    return Math.max(0, mem.total - mem.free - reclaimable);
  }
  // Linux/other: matches htop's "used" column.
  const available =
    typeof mem.available === 'number' && mem.available > 0 ? mem.available : mem.free;
  return Math.max(0, mem.total - available);
}

// macOS-only: shell out to system_profiler to match what System Settings shows.
// Settings subtracts "purgeable" space from used (Time Machine local snapshots,
// regeneratable caches, etc.), so it differs from `df`. system_profiler reads from
// the same source as Settings.
//
// system_profiler is slow (~1s), so we cache. Storage doesn't change quickly.
interface MacosStorageVolume {
  _name?: string;
  mount_point?: string;
  size_in_bytes?: number;
  free_space_in_bytes?: number;
}
const MACOS_STORAGE_TTL_MS = 60_000;
let macosStorageCache: { ts: number; data: DiskInfo[] } | null = null;

async function getMacosStorageDisks(): Promise<DiskInfo[] | null> {
  if (macosStorageCache && Date.now() - macosStorageCache.ts < MACOS_STORAGE_TTL_MS) {
    return macosStorageCache.data;
  }
  try {
    const { stdout } = await execFileAsync(
      'system_profiler',
      ['SPStorageDataType', '-json'],
      { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { SPStorageDataType?: MacosStorageVolume[] };
    const vols = parsed.SPStorageDataType ?? [];
    const disks: DiskInfo[] = [];
    for (const v of vols) {
      if (typeof v.size_in_bytes !== 'number' || typeof v.free_space_in_bytes !== 'number')
        continue;
      const total = v.size_in_bytes;
      const used = Math.max(0, total - v.free_space_in_bytes);
      disks.push({
        mount: v.mount_point ?? v._name ?? 'unknown',
        total,
        used,
        usedPercent: total > 0 ? (used / total) * 100 : 0,
      });
    }
    if (disks.length === 0) return null;
    disks.sort((a, b) => b.used - a.used);
    macosStorageCache = { ts: Date.now(), data: disks };
    return disks;
  } catch {
    // Fall back to df-style reporting silently.
    return null;
  }
}

export async function collectOs(): Promise<OsMetrics> {
  const [load, mem, fs, net, time, macosDisks] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.networkStats(),
    si.time(),
    IS_MACOS ? getMacosStorageDisks() : Promise.resolve(null),
  ]);

  const cpuPercent = Number.isFinite(load.currentLoad) ? load.currentLoad : null;

  const used = computeUsedMemory(mem);
  const free = Math.max(0, mem.total - used);

  const [m1, m5, m15] = loadavg();

  // Disk: prefer macOS user-facing numbers (Settings/Storage view) when available.
  // Otherwise filter df-reported mounts and pick the most-used real disk first.
  const disks: DiskInfo[] =
    macosDisks ??
    fs
      .filter((d) => !SYSTEM_FS_TYPES.has(d.type) && d.size >= MIN_DISK_BYTES)
      .map((d) => ({
        mount: d.mount,
        total: d.size,
        used: d.used,
        usedPercent: d.use,
      }))
      .sort((a, b) => b.used - a.used);

  return {
    cpuPercent,
    loadAvg: [m1 ?? 0, m5 ?? 0, m15 ?? 0],
    memory: {
      total: mem.total,
      used,
      free,
      usedPercent: (used / mem.total) * 100,
    },
    uptime: time.uptime,
    disks,
    network: net.map((n) => ({
      iface: n.iface,
      rxBytes: n.rx_bytes,
      txBytes: n.tx_bytes,
      // systeminformation tracks the previous sample internally; rx_sec/tx_sec are
      // bytes/sec since the last call. First call returns -1 (no baseline) — clamp to 0.
      rxRate: Number.isFinite(n.rx_sec) && n.rx_sec >= 0 ? Math.round(n.rx_sec) : 0,
      txRate: Number.isFinite(n.tx_sec) && n.tx_sec >= 0 ? Math.round(n.tx_sec) : 0,
    })),
  };
}
