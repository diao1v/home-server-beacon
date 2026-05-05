import { request } from 'node:http';

/**
 * Minimal direct client for the Docker Engine API over the unix socket.
 *
 * Why not use `systeminformation.dockerContainerStats`?
 * - It strips `memory_stats.stats` (or the field names vary across cgroup
 *   versions and we can't reliably get the real anonymous-memory number).
 * - We need cgroup v1 vs v2 awareness to subtract page cache the way
 *   `docker stats` CLI does. The raw API has all the fields we need.
 */

const SOCKET_PATH = '/var/run/docker.sock';
const API_VERSION = 'v1.43';
const TIMEOUT_MS = 5000;

interface DockerContainerSummary {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}

export interface DockerStats {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage?: { total_usage?: number };
    system_cpu_usage?: number;
  };
  memory_stats: {
    usage?: number;
    limit?: number;
    stats?: Record<string, number>;
  };
}

function get<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    const req = request(
      {
        socketPath: SOCKET_PATH,
        path: `/${API_VERSION}${path}`,
        method: 'GET',
        timeout: TIMEOUT_MS,
      },
      (res) => {
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(new Error(`docker api ${path}: ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`docker api ${path}: timeout`));
    });
    req.on('error', reject);
    req.end();
  });
}

export function listRunningContainers(): Promise<DockerContainerSummary[]> {
  // /containers/json with no query returns running containers only.
  return get<DockerContainerSummary[]>('/containers/json');
}

export function containerStats(id: string): Promise<DockerStats> {
  // stream=false → one-shot snapshot. precpu_stats is empty on first call.
  return get<DockerStats>(`/containers/${id}/stats?stream=false`);
}
