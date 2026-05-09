import { execFile } from 'node:child_process';
import { existsSync, readFileSync, statfsSync } from 'node:fs';
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
  'cgroup',
  'cgroup2',
  'devtmpfs',
  'mqueue',
  'debugfs',
  'tracefs',
  'securityfs',
  'pstore',
  'ramfs',
  'fuse.gvfsd-fuse',
  'fuse.portal',
]);
const MIN_DISK_BYTES = 1 * 1024 * 1024 * 1024; // 1 GiB

const IS_MACOS = platform() === 'darwin';

// When the agent runs in Docker with `- /:/host:ro`, host filesystems live at
// /host/<mount>. statfs goes through the bind mount. On native installs this
// path won't exist and we just statfs the real mountpoint.
const HOST_ROOT_BIND = '/host';

function pathForStatfs(mountpoint: string): string {
  if (!existsSync(HOST_ROOT_BIND)) return mountpoint;
  return mountpoint === '/' ? HOST_ROOT_BIND : `${HOST_ROOT_BIND}${mountpoint}`;
}

function computeUsedMemory(mem: si.Systeminformation.MemData): number {
  if (IS_MACOS) {
    const reclaimable = typeof mem.reclaimable === 'number' ? mem.reclaimable : 0;
    return Math.max(0, mem.total - mem.free - reclaimable);
  }
  const available =
    typeof mem.available === 'number' && mem.available > 0 ? mem.available : mem.free;
  return Math.max(0, mem.total - available);
}

// ────────────────────────────────────────────────────────────────────────────
// macOS Settings-style storage (system_profiler)

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
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Linux: per-physical-disk view via lsblk

interface LsblkNode {
  name: string;
  size: number;
  type: string;
  mountpoint: string | null;
  fstype: string | null;
  children?: LsblkNode[];
}

async function readLsblk(): Promise<LsblkNode[]> {
  try {
    const { stdout } = await execFileAsync(
      'lsblk',
      ['--json', '--bytes', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE'],
      { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { blockdevices?: LsblkNode[] };
    return parsed.blockdevices ?? [];
  } catch {
    return [];
  }
}

/**
 * Build a `device-name → mountpoint` map from the host's mount table.
 * lsblk inside a Docker container reads /proc/self/mountinfo (the container's
 * mounts), so partition.mountpoint is null for host mounts. With `pid: host`,
 * /proc/1/mounts is the host's mount table — we merge it into lsblk's tree
 * keyed by device name (last path component, plus the full /dev path).
 */
function readHostMountMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const content = readFileSync('/proc/1/mounts', 'utf8');
    for (const line of content.split('\n')) {
      const parts = line.split(/\s+/);
      const device = parts[0];
      const rawMp = parts[1];
      if (!device || !rawMp) continue;
      const mp = rawMp.replace(/\\040/g, ' ');
      if (!mp.startsWith('/')) continue;

      // Index by full path AND by basename so we can match either form.
      // (lsblk's "name" is the basename; /proc/mounts has the full /dev/... path.)
      if (!map.has(device)) map.set(device, mp);
      const slash = device.lastIndexOf('/');
      const base = slash >= 0 ? device.slice(slash + 1) : device;
      if (base && !map.has(base)) map.set(base, mp);
    }
  } catch {
    // /proc/1/mounts not readable (no pid:host, or permission) — return empty,
    // we'll just not have host mountpoints.
  }
  return map;
}

function flattenMountpoints(
  node: LsblkNode,
  hostMounts: Map<string, string>,
  out: string[],
): void {
  // Prefer lsblk's mountpoint (works on native installs where lsblk and the
  // agent share a mount namespace). Fall back to host mount map for the
  // common Docker-with-pid:host case.
  const mp = node.mountpoint ?? hostMounts.get(node.name);
  if (mp && mp !== '[SWAP]' && !mp.startsWith('/proc')) {
    out.push(mp);
  }
  for (const c of node.children ?? []) flattenMountpoints(c, hostMounts, out);
}

async function collectLsblkDisks(): Promise<DiskInfo[]> {
  const devices = await readLsblk();
  if (devices.length === 0) return [];

  const hostMounts = readHostMountMap();

  const disks: DiskInfo[] = [];
  for (const dev of devices) {
    if (dev.type !== 'disk') continue;
    if (typeof dev.size !== 'number' || dev.size < MIN_DISK_BYTES) continue;

    const mountpoints: string[] = [];
    flattenMountpoints(dev, hostMounts, mountpoints);

    let used = 0;
    for (const mp of mountpoints) {
      try {
        const stat = statfsSync(pathForStatfs(mp));
        used += (stat.blocks - stat.bavail) * stat.bsize;
      } catch {
        // Not statfs-able from inside the container (no /host mount, or skipped fs).
      }
    }

    disks.push({
      mount: dev.name,
      total: dev.size,
      used,
      usedPercent: dev.size > 0 ? (used / dev.size) * 100 : 0,
      mountpoints,
    });
  }

  // Largest disks first. Stable enough for a UI ordering.
  return disks.sort((a, b) => b.total - a.total);
}

// ────────────────────────────────────────────────────────────────────────────
// Linux: mountpoint fallback (when lsblk isn't available or gave nothing useful)

interface HostMount {
  device: string;
  mountpoint: string;
  fstype: string;
}

function readHostMounts(): HostMount[] {
  try {
    const content = readFileSync('/proc/1/mounts', 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          device: parts[0] ?? '',
          mountpoint: (parts[1] ?? '').replace(/\\040/g, ' '),
          fstype: parts[2] ?? '',
        };
      });
  } catch {
    return [];
  }
}

function isInterestingMount(m: HostMount): boolean {
  if (SYSTEM_FS_TYPES.has(m.fstype)) return false;
  if (!m.mountpoint || !m.mountpoint.startsWith('/')) return false;
  const skipPrefixes = ['/proc', '/sys', '/dev', '/run', '/var/lib/docker', HOST_ROOT_BIND];
  if (skipPrefixes.some((p) => m.mountpoint === p || m.mountpoint.startsWith(`${p}/`))) {
    return false;
  }
  return true;
}

function collectHostMountDisks(): DiskInfo[] {
  if (!existsSync(HOST_ROOT_BIND)) return [];
  const mounts = readHostMounts();
  if (mounts.length === 0) return [];

  const seen = new Set<string>();
  const disks: DiskInfo[] = [];
  for (const m of mounts) {
    if (!isInterestingMount(m)) continue;
    if (seen.has(m.mountpoint)) continue;
    seen.add(m.mountpoint);

    try {
      const stat = statfsSync(pathForStatfs(m.mountpoint));
      const total = stat.blocks * stat.bsize;
      if (total < MIN_DISK_BYTES) continue;
      const free = stat.bavail * stat.bsize;
      disks.push({
        mount: m.mountpoint,
        total,
        used: total - free,
        usedPercent: total > 0 ? ((total - free) / total) * 100 : 0,
      });
    } catch {}
  }
  return disks.sort((a, b) => b.used - a.used);
}

function collectFallbackDisks(fs: si.Systeminformation.FsSizeData[]): DiskInfo[] {
  return fs
    .filter((d) => !SYSTEM_FS_TYPES.has(d.type) && d.size >= MIN_DISK_BYTES)
    .map((d) => ({
      mount: d.mount,
      total: d.size,
      used: d.used,
      usedPercent: d.use,
    }))
    .sort((a, b) => b.used - a.used);
}

// ────────────────────────────────────────────────────────────────────────────

export async function collectOs(): Promise<OsMetrics> {
  const [load, mem, fs, net, time, temp, macosDisks, ioStats] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.networkStats(),
    si.time(),
    si.cpuTemperature(),
    IS_MACOS ? getMacosStorageDisks() : Promise.resolve(null),
    // fsStats can throw on systems without IO accounting (rare); fail-soft to zeros.
    si.fsStats().catch(() => null),
  ]);

  const safeRate = (v: number | null | undefined): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  const io = {
    readRate: safeRate(ioStats?.rx_sec),
    writeRate: safeRate(ioStats?.wx_sec),
  };

  const cpuPercent = Number.isFinite(load.currentLoad) ? load.currentLoad : null;
  const temperature =
    typeof temp.main === 'number' && temp.main > 0 ? temp.main : null;

  const used = computeUsedMemory(mem);
  const free = Math.max(0, mem.total - used);

  const [m1, m5, m15] = loadavg();

  // Disk source priority:
  //   1. macOS: system_profiler (Settings-style)
  //   2. Linux: lsblk per-physical-disk
  //   3. Linux: /proc/1/mounts via /host bind (mountpoint view)
  //   4. Last resort: systeminformation's view (container-local)
  let disks: DiskInfo[];
  if (macosDisks) {
    disks = macosDisks;
  } else {
    const lsblkDisks = await collectLsblkDisks();
    if (lsblkDisks.length > 0) {
      disks = lsblkDisks;
    } else {
      const hostDisks = collectHostMountDisks();
      disks = hostDisks.length > 0 ? hostDisks : collectFallbackDisks(fs);
    }
  }

  return {
    cpuPercent,
    temperature,
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
      rxRate: Number.isFinite(n.rx_sec) && n.rx_sec >= 0 ? Math.round(n.rx_sec) : 0,
      txRate: Number.isFinite(n.tx_sec) && n.tx_sec >= 0 ? Math.round(n.tx_sec) : 0,
    })),
    io,
  };
}
