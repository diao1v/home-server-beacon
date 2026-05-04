import { z } from 'zod';

const boolFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const Env = z.object({
  SERVER_ID: z.string().min(1),
  API_KEY: z.string().min(16, 'API_KEY must be at least 16 characters'),
  BIND_HOST: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3005),
  ENABLE_DOCKER: boolFromEnv,
  ENABLE_PM2: boolFromEnv,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SAMPLE_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
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
