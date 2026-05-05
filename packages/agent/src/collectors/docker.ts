import {
  type DockerContainer,
  type DockerContainerStatus,
  type DockerMetrics,
} from '@homelab/shared';
import { containerStats, type DockerStats, listRunningContainers } from '../lib/docker-api.js';

const KNOWN: readonly DockerContainerStatus[] = [
  'running',
  'exited',
  'paused',
  'created',
  'restarting',
  'removing',
  'dead',
];

function parseStatus(state: string | undefined): DockerContainerStatus {
  if (!state) return 'unknown';
  return (KNOWN as readonly string[]).includes(state)
    ? (state as DockerContainerStatus)
    : 'unknown';
}

/**
 * "Real" memory used by a container. Mirrors the `docker stats` CLI:
 *   - cgroup v2: `memory_stats.stats.anon` (anonymous pages — actually allocated)
 *   - cgroup v1: `memory_stats.usage - inactive_file` (subtract reclaimable cache)
 *   - older fallback: `usage - cache`
 *
 * Without this, file-heavy containers (torrent clients, media servers) report
 * many GB of "memory" that's actually reclaimable page cache.
 */
function realMemoryUsed(stats: DockerStats): number {
  const usage = stats.memory_stats.usage ?? 0;
  const inner = stats.memory_stats.stats ?? {};

  if (typeof inner.anon === 'number' && inner.anon > 0) return inner.anon;

  const inactiveFile =
    inner.total_inactive_file ?? inner.inactive_file ?? inner.cache ?? inner.total_cache ?? 0;
  if (inactiveFile > 0) return Math.max(0, usage - inactiveFile);

  return usage;
}

function cpuPercent(stats: DockerStats): number | null {
  const cpuDelta =
    stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats.cpu_usage?.total_usage ?? 0);
  const sysDelta =
    (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0);
  if (sysDelta <= 0 || cpuDelta < 0) return null;
  const onlineCpus = stats.cpu_stats.online_cpus ?? 1;
  return (cpuDelta / sysDelta) * onlineCpus * 100;
}

export async function collectDocker(): Promise<DockerMetrics> {
  const list = await listRunningContainers();
  if (list.length === 0) return { containers: [] };

  // Fetch stats in parallel. One failure shouldn't drop the whole collection.
  const stats = await Promise.all(
    list.map((c) =>
      containerStats(c.Id).catch(() => null as DockerStats | null),
    ),
  );

  const containers: DockerContainer[] = list.map((c, i) => {
    const s = stats[i];
    return {
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, '') ?? 'unknown',
      image: c.Image ?? 'unknown',
      status: parseStatus(c.State),
      cpuPercent: s ? cpuPercent(s) : null,
      memory: {
        used: s ? realMemoryUsed(s) : 0,
        limit: s?.memory_stats.limit ?? 0,
      },
      sizeRw: c.SizeRw ?? 0,
      sizeTotal: c.SizeRootFs ?? 0,
    };
  });

  return { containers };
}
