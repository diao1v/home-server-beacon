import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ServersConfig } from '@homelab/shared';
import { parse as parseYaml } from 'yaml';
import { env } from './env.js';
import { logger } from './logger.js';

export function loadServersConfig(): ServersConfig {
  const path = resolve(process.cwd(), env.SERVERS_CONFIG);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    logger.fatal({ err, path }, 'failed to read servers config');
    process.exit(1);
  }
  let yaml: unknown;
  try {
    yaml = parseYaml(raw);
  } catch (err) {
    logger.fatal({ err, path }, 'failed to parse servers config as YAML');
    process.exit(1);
  }
  const result = ServersConfig.safeParse(yaml);
  if (!result.success) {
    logger.fatal({ issues: result.error.issues, path }, 'servers config validation failed');
    process.exit(1);
  }
  // Detect duplicate server ids — they would silently shadow each other.
  const seen = new Set<string>();
  for (const s of result.data.servers) {
    if (seen.has(s.id)) {
      logger.fatal({ id: s.id }, 'duplicate server id in servers config');
      process.exit(1);
    }
    seen.add(s.id);
  }
  logger.info({ path, count: result.data.servers.length }, 'servers config loaded');
  return result.data;
}
