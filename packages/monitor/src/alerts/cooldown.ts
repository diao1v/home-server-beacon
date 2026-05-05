/**
 * In-memory per-(server, condition) cooldown table.
 * Lost on monitor restart — acceptable; restart re-arms all alerts.
 */

export type AlertCondition = 'offline' | 'recovered';

const lastSent = new Map<string, number>();

function key(serverId: string, condition: AlertCondition): string {
  return `${serverId}:${condition}`;
}

export function allows(
  serverId: string,
  condition: AlertCondition,
  cooldownMs: number,
): boolean {
  const last = lastSent.get(key(serverId, condition));
  if (last === undefined) return true;
  return Date.now() - last >= cooldownMs;
}

export function record(serverId: string, condition: AlertCondition): void {
  lastSent.set(key(serverId, condition), Date.now());
}

export function reset(): void {
  lastSent.clear();
}
