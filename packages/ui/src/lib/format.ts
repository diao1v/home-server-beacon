import type { NetworkInfo, ServerStateView } from '@homelab/shared';

export type DisplayStatus = 'waiting' | 'online' | 'degraded' | 'offline';

/**
 * "Waiting" is a UI-only derived state for servers that have never reported —
 * registered in servers.yaml but no successful poll yet. Distinct from "offline"
 * (which means we had data and lost it).
 */
export function deriveStatus(s: ServerStateView): DisplayStatus {
  if (s.status === 'offline' && s.lastSeen === null) return 'waiting';
  return s.status;
}

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

const SKIP_IFACE_PREFIXES = ['lo', 'docker', 'br-', 'veth'] as const;

/**
 * Pick the most likely WAN-facing interface. Skips loopback / docker bridges /
 * veth pairs, then prefers the one with the most cumulative rx (typically the
 * physical NIC carrying the most traffic).
 */
export function pickPrimaryNetwork(network: NetworkInfo[]): NetworkInfo | null {
  const real = network.filter(
    (n) => !SKIP_IFACE_PREFIXES.some((p) => n.iface.startsWith(p)),
  );
  if (real.length === 0) return null;
  return real.reduce((max, n) => (n.rxBytes > max.rxBytes ? n : max));
}

export function fmtRate(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return '0.00M/s';
  return `${(bytesPerSec / 1024 / 1024).toFixed(2)}M/s`;
}

export type BarColor = 'green' | 'amber' | 'red' | 'muted';

export function makeBar(percent: number | null, width = 24): { text: string; color: BarColor } {
  if (percent === null || Number.isNaN(percent)) {
    return { text: `[${' '.repeat(width)}]`, color: 'muted' };
  }
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const text = `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
  const color: BarColor = clamped > 85 ? 'red' : clamped > 60 ? 'amber' : 'green';
  return { text, color };
}

/**
 * Render a sequence of percentage values as a unicode-block sparkline.
 * Down/up-samples to `width` characters. Null entries render as spaces (gaps).
 */
export function makeSparkline(values: ReadonlyArray<number | null>, width = 30): string {
  if (values.length === 0) return ' '.repeat(width);
  const sampled = sampleTo(values, width);
  return sampled
    .map((v) => {
      if (v === null) return ' ';
      const clamped = Math.max(0, Math.min(100, v));
      const idx = Math.min(7, Math.floor((clamped / 100) * 8));
      return BLOCKS[idx];
    })
    .join('');
}

function sampleTo(
  values: ReadonlyArray<number | null>,
  target: number,
): Array<number | null> {
  if (values.length === target) return [...values];
  if (values.length > target) {
    const result: Array<number | null> = [];
    const step = values.length / target;
    for (let i = 0; i < target; i++) {
      const start = Math.floor(i * step);
      const end = Math.max(start + 1, Math.floor((i + 1) * step));
      const slice = values.slice(start, end);
      const valid = slice.filter((v): v is number => v !== null);
      result.push(valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null);
    }
    return result;
  }
  // Fewer values than width — left-pad with empties so the line grows in from the right.
  return [...Array(target - values.length).fill(null), ...values];
}

export function fmtPercent(p: number | null): string {
  if (p === null || Number.isNaN(p)) return '—';
  return `${p.toFixed(1)}%`;
}

export function fmtTemp(t: number | null): string {
  if (t === null || Number.isNaN(t)) return '—';
  return `${Math.round(t)}°C`;
}

export function fmtBytesPair(used: number, total: number): string {
  return `${fmtBytes(used)}/${fmtBytes(total)}`;
}

export function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'K', 'M', 'G', 'T'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  if (v >= 100) return `${v.toFixed(0)}${units[i]}`;
  if (v >= 10) return `${v.toFixed(1)}${units[i]}`;
  return `${v.toFixed(2)}${units[i]}`;
}

export function fmtAgo(timestamp: number | null): string {
  if (timestamp === null) return 'never';
  const s = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
