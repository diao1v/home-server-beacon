import { request } from 'node:http';

/**
 * Minimal direct client for the Docker Engine API over the unix socket.
 * Used instead of `systeminformation.dockerContainerStats` because that wrapper
 * doesn't expose the cgroup memory_stats fields we need to compute "real" memory.
 */

const SOCKET_PATH = '/var/run/docker.sock';
const API_VERSION = 'v1.43';
const DEFAULT_TIMEOUT_MS = 5000;
// /containers/json?size=true forces the daemon to walk each writable layer to
// compute SizeRw — slow on hosts with big writeable layers. Give it more room.
const LIST_WITH_SIZE_TIMEOUT_MS = 20000;

interface DockerContainerSummary {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  // Only populated when ?size=true is passed.
  SizeRw?: number;
  SizeRootFs?: number;
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

function get<T>(path: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    const req = request(
      {
        socketPath: SOCKET_PATH,
        path: `/${API_VERSION}${path}`,
        method: 'GET',
        timeout: timeoutMs,
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

export async function listRunningContainers(): Promise<DockerContainerSummary[]> {
  // Try with size first. If the daemon is too slow (heavy writable layers),
  // fall back to a size-less list so the rest of the docker section still works.
  try {
    return await get<DockerContainerSummary[]>(
      '/containers/json?size=true',
      LIST_WITH_SIZE_TIMEOUT_MS,
    );
  } catch {
    return get<DockerContainerSummary[]>('/containers/json');
  }
}

export function containerStats(id: string): Promise<DockerStats> {
  return get<DockerStats>(`/containers/${id}/stats?stream=false`);
}
