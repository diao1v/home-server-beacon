import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  BIND_HOST: z.string().min(1).default('0.0.0.0'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  HISTORY_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  DB_PATH: z.string().default('./data/monitor.sqlite'),
  // Defaults assume CWD = packages/monitor (i.e. how `pnpm --filter @homelab/monitor dev`
  // runs). For prod, use absolute paths via PM2's env config.
  SERVERS_CONFIG: z.string().default('../../servers.yaml'),
  ALERTS_CONFIG: z.string().default('../../alerts.yaml'),
  // Built UI bundle to serve as static. Empty string disables UI serving (Option B).
  UI_DIST_PATH: z.string().default('../ui/dist'),
  // Comma-separated list of allowed origins for CORS. Empty = no CORS (same-origin only).
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
