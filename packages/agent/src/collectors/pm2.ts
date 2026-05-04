import {
  type Pm2Metrics,
  type Pm2Process,
  type Pm2ProcessStatus,
} from '@homelab/shared';

type Pm2Module = typeof import('pm2');

let pm2Module: Pm2Module | null = null;
let connected = false;

async function ensureConnected(): Promise<Pm2Module> {
  if (pm2Module && connected) return pm2Module;
  if (!pm2Module) {
    const mod = await import('pm2');
    pm2Module = (mod.default ?? mod) as Pm2Module;
  }
  await new Promise<void>((resolve, reject) => {
    pm2Module!.connect((err) => (err ? reject(err) : resolve()));
  });
  connected = true;
  return pm2Module;
}

const KNOWN: readonly Pm2ProcessStatus[] = [
  'online',
  'stopping',
  'stopped',
  'launching',
  'errored',
  'one-launch-status',
];

function parseStatus(s: unknown): Pm2ProcessStatus {
  if (typeof s === 'string' && (KNOWN as readonly string[]).includes(s)) {
    return s as Pm2ProcessStatus;
  }
  return 'stopped';
}

interface Pm2ListItem {
  name?: string;
  pid?: number;
  monit?: { cpu?: number; memory?: number };
  pm2_env?: { status?: string; pm_uptime?: number; restart_time?: number };
}

export async function collectPm2(): Promise<Pm2Metrics> {
  const pm2 = await ensureConnected();
  const list = await new Promise<Pm2ListItem[]>((resolve, reject) => {
    pm2.list((err, procs) => (err ? reject(err) : resolve(procs as Pm2ListItem[])));
  });

  const now = Date.now();
  const processes: Pm2Process[] = list.map((p) => {
    const monit = p.monit ?? {};
    const env = p.pm2_env ?? {};
    const uptime =
      typeof env.pm_uptime === 'number' ? Math.max(0, Math.floor((now - env.pm_uptime) / 1000)) : 0;
    return {
      name: p.name ?? 'unknown',
      status: parseStatus(env.status),
      pid: typeof p.pid === 'number' && p.pid > 0 ? p.pid : null,
      cpuPercent: typeof monit.cpu === 'number' && Number.isFinite(monit.cpu) ? monit.cpu : null,
      memoryMb: typeof monit.memory === 'number' ? monit.memory / (1024 * 1024) : 0,
      uptime,
      restartCount: typeof env.restart_time === 'number' ? env.restart_time : 0,
    };
  });

  return { processes };
}

export function disconnectPm2(): void {
  if (pm2Module && connected) {
    pm2Module.disconnect();
    connected = false;
  }
}
