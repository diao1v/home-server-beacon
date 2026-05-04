import { z } from 'zod';

const NullableNumber = z.number().nullable();

export const DiskInfo = z.object({
  mount: z.string(),
  total: z.number(),
  used: z.number(),
  usedPercent: z.number(),
});
export type DiskInfo = z.infer<typeof DiskInfo>;

export const NetworkInfo = z.object({
  iface: z.string(),
  rxBytes: z.number(),
  txBytes: z.number(),
});
export type NetworkInfo = z.infer<typeof NetworkInfo>;

export const OsMetrics = z.object({
  cpuPercent: NullableNumber,
  loadAvg: z.tuple([z.number(), z.number(), z.number()]),
  memory: z.object({
    total: z.number(),
    used: z.number(),
    free: z.number(),
    usedPercent: z.number(),
  }),
  uptime: z.number(),
  disks: z.array(DiskInfo),
  network: z.array(NetworkInfo),
});
export type OsMetrics = z.infer<typeof OsMetrics>;

export const DockerContainerStatus = z.enum([
  'running',
  'exited',
  'paused',
  'created',
  'restarting',
  'removing',
  'dead',
  'unknown',
]);
export type DockerContainerStatus = z.infer<typeof DockerContainerStatus>;

export const DockerContainer = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  status: DockerContainerStatus,
  cpuPercent: NullableNumber,
  memory: z.object({
    used: z.number(),
    limit: z.number(),
  }),
});
export type DockerContainer = z.infer<typeof DockerContainer>;

export const DockerMetrics = z.object({
  containers: z.array(DockerContainer),
});
export type DockerMetrics = z.infer<typeof DockerMetrics>;

export const Pm2ProcessStatus = z.enum([
  'online',
  'stopping',
  'stopped',
  'launching',
  'errored',
  'one-launch-status',
]);
export type Pm2ProcessStatus = z.infer<typeof Pm2ProcessStatus>;

export const Pm2Process = z.object({
  name: z.string(),
  status: Pm2ProcessStatus,
  pid: z.number().nullable(),
  cpuPercent: NullableNumber,
  memoryMb: z.number(),
  uptime: z.number(),
  restartCount: z.number(),
});
export type Pm2Process = z.infer<typeof Pm2Process>;

export const Pm2Metrics = z.object({
  processes: z.array(Pm2Process),
});
export type Pm2Metrics = z.infer<typeof Pm2Metrics>;

export const MetricsSnapshot = z.object({
  meta: z.object({
    hostname: z.string(),
    serverId: z.string(),
    version: z.string(),
    timestamp: z.string(),
  }),
  os: OsMetrics,
  docker: DockerMetrics.nullable(),
  pm2: Pm2Metrics.nullable(),
});
export type MetricsSnapshot = z.infer<typeof MetricsSnapshot>;
