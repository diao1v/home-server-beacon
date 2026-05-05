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

export async function collectDocker(): Promise<DockerMetrics> {
  // Only running containers — stopped ones don't consume resources, so they're noise
  // for a resource dashboard.
  const list = await si.dockerContainers(false);
  if (list.length === 0) return { containers: [] };

  // dockerContainerStats accepts a comma-separated id list or '*' for all running.
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
        used: s?.memUsage ?? 0,
        limit: s?.memLimit ?? 0,
      },
    };
  });

  return { containers };
}
