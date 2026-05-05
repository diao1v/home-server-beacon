import si from 'systeminformation';
import {
  type DockerContainer,
  type DockerContainerStatus,
  type DockerMetrics,
} from '@homelab/shared';

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
 * Docker's API reports memory usage including the kernel page cache. For something
 * like a torrent client or media server with heavy file IO, that can be many GB
 * of reclaimable cache — making the container look like it's hoarding RAM when
 * it really isn't. The `docker stats` CLI subtracts cache; we do the same.
 *
 * cgroup v1 reports `cache` / `total_cache`; cgroup v2 reports `file` (file-backed
 * pages). We try all three and fall back to raw if none are present.
 */
function realMemoryUsed(stats: si.Systeminformation.DockerContainerStatsData): number {
  const usage = stats.memUsage ?? 0;
  // memory_stats is exposed by systeminformation as `any`; reach into it defensively.
  const memStats = (stats as unknown as { memory_stats?: { stats?: Record<string, number> } })
    .memory_stats?.stats;
  if (memStats) {
    const cache = memStats.cache ?? memStats.total_cache ?? memStats.file ?? 0;
    if (cache > 0) return Math.max(0, usage - cache);
  }
  return usage;
}

export async function collectDocker(): Promise<DockerMetrics> {
  // Only running containers — stopped ones don't consume resources, so they're noise
  // for a resource dashboard.
  const list = await si.dockerContainers(false);
  if (list.length === 0) return { containers: [] };

  const ids = list.map((c) => c.id).join(',');
  const stats = await si.dockerContainerStats(ids);
  const statsById = new Map(stats.map((s) => [s.id, s]));

  const containers: DockerContainer[] = list.map((c) => {
    const s = statsById.get(c.id);
    const cpuPercent = s && Number.isFinite(s.cpuPercent) ? s.cpuPercent : null;
    return {
      id: c.id,
      name: c.name ?? 'unknown',
      image: c.image ?? 'unknown',
      status: parseStatus(c.state),
      cpuPercent,
      memory: {
        used: s ? realMemoryUsed(s) : 0,
        limit: s?.memLimit ?? 0,
      },
    };
  });

  return { containers };
}
