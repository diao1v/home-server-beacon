import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AlertsConfig } from '@homelab/shared';
import { parse as parseYaml } from 'yaml';
import { env } from '../env.js';
import { logger } from '../logger.js';

/**
 * Loads alerts.yaml. Returns null when the file is missing or malformed —
 * alerting is optional, so a missing config disables the feature without crashing.
 */
export function loadAlertsConfig(): AlertsConfig | null {
  const path = resolve(process.cwd(), env.ALERTS_CONFIG);
  if (!existsSync(path)) {
    logger.info({ path }, 'no alerts config found; alerting disabled');
    return null;
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    logger.warn({ err, path }, 'failed to read alerts config; alerting disabled');
    return null;
  }
  let yaml: unknown;
  try {
    yaml = parseYaml(raw);
  } catch (err) {
    logger.warn({ err, path }, 'failed to parse alerts config; alerting disabled');
    return null;
  }
  const parsed = AlertsConfig.safeParse(yaml);
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues, path },
      'alerts config validation failed; alerting disabled',
    );
    return null;
  }
  logger.info({ path, enabled: parsed.data.enabled }, 'alerts config loaded');
  return parsed.data;
}
