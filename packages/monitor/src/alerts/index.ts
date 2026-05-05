import type { AlertsConfig } from '@homelab/shared';
import { logger } from '../logger.js';
import { type ServerState, state } from '../state.js';
import { allows, record } from './cooldown.js';
import { initMailgun, send } from './mailgun.js';

export { loadAlertsConfig } from './config.js';

function buildOfflineBody(s: ServerState): string {
  const lines = [
    `Server:   ${s.displayName} (${s.id})`,
    `Status:   OFFLINE`,
    `At:       ${new Date().toISOString()}`,
    `Last seen: ${s.lastSeen ? new Date(s.lastSeen).toISOString() : 'never'}`,
    `Failures: ${s.consecutiveFailures}`,
  ];
  if (s.lastError) lines.push(`Error:    ${s.lastError}`);
  return lines.join('\n');
}

function buildRecoveredBody(s: ServerState): string {
  return [
    `Server: ${s.displayName} (${s.id})`,
    `Status: RECOVERED (now online)`,
    `At:     ${new Date().toISOString()}`,
  ].join('\n');
}

export function startAlerts(config: AlertsConfig): void {
  if (!config.enabled) {
    logger.info('alerting disabled in config (enabled: false)');
    return;
  }
  initMailgun(config);

  const cooldownMs = config.cooldownMinutes * 60 * 1000;

  state.on('offline', (s: ServerState) => {
    if (!allows(s.id, 'offline', cooldownMs)) {
      logger.debug({ serverId: s.id }, 'offline alert suppressed by cooldown');
      return;
    }
    record(s.id, 'offline');
    void send(`[homelab] ${s.displayName} is offline`, buildOfflineBody(s));
  });

  state.on('recovered', (s: ServerState) => {
    if (!allows(s.id, 'recovered', cooldownMs)) {
      logger.debug({ serverId: s.id }, 'recovered alert suppressed by cooldown');
      return;
    }
    record(s.id, 'recovered');
    void send(`[homelab] ${s.displayName} recovered`, buildRecoveredBody(s));
  });

  logger.info(
    { cooldownMinutes: config.cooldownMinutes },
    'alerts subscribed to state events',
  );
}
