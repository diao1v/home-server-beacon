import { loadavg } from 'node:os';
import si from 'systeminformation';
import type { OsMetrics } from '@homelab/shared';

export async function collectOs(): Promise<OsMetrics> {
  const [load, mem, fs, net, time] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.networkStats(),
    si.time(),
  ]);

  // systeminformation's first call returns 0 for currentLoad until it has a baseline.
  // We treat 0 from a freshly-booted sampler as "not yet computed" only when the
  // CPU truly has no activity history; otherwise 0 is a legitimate reading.
  const cpuPercent = Number.isFinite(load.currentLoad) ? load.currentLoad : null;

  // available = free + reclaimable cache; use it for a "real" used value (matches `free -h` available column).
  const available = typeof mem.available === 'number' && mem.available > 0 ? mem.available : mem.free;
  const used = mem.total - available;

  const [m1, m5, m15] = loadavg();

  return {
    cpuPercent,
    loadAvg: [m1 ?? 0, m5 ?? 0, m15 ?? 0],
    memory: {
      total: mem.total,
      used,
      free: available,
      usedPercent: (used / mem.total) * 100,
    },
    uptime: time.uptime,
    disks: fs.map((d) => ({
      mount: d.mount,
      total: d.size,
      used: d.used,
      usedPercent: d.use,
    })),
    network: net.map((n) => ({
      iface: n.iface,
      rxBytes: n.rx_bytes,
      txBytes: n.tx_bytes,
    })),
  };
}
