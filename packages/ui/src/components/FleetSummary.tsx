import type { ServerStateView } from '@homelab/shared';
import { fmtRate, pickPrimaryNetwork } from '../lib/format';
import { useStore } from '../store';

function avg(values: ReadonlyArray<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function fleetRates(servers: ServerStateView[]): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  for (const s of servers) {
    if (!s.latestSnapshot) continue;
    const p = pickPrimaryNetwork(s.latestSnapshot.os.network);
    if (!p) continue;
    rx += p.rxRate;
    tx += p.txRate;
  }
  return { rx, tx };
}

export function FleetSummary() {
  const servers = useStore((s) => s.servers);
  if (servers.length === 0) return null;

  const counts = { online: 0, degraded: 0, offline: 0 };
  for (const s of servers) counts[s.status] += 1;

  const cpu = avg(servers.map((s) => s.latestSnapshot?.os.cpuPercent));
  const ram = avg(servers.map((s) => s.latestSnapshot?.os.memory.usedPercent));
  const net = fleetRates(servers);

  return (
    <section className="bg-panel border border-border px-3.5 py-2 mb-3 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 text-xs">
      <div className="text-cyan tracking-widest self-center">[FLEET]</div>
      <div className="flex gap-x-4 flex-wrap items-center">
        <span>
          <span className="text-text">{servers.length}</span>{' '}
          <span className="text-muted">servers</span>
        </span>
        <span className="text-green">● {counts.online} online</span>
        <span className={counts.degraded > 0 ? 'text-amber' : 'text-muted'}>
          ● {counts.degraded} degraded
        </span>
        <span className={counts.offline > 0 ? 'text-red' : 'text-muted'}>
          ○ {counts.offline} offline
        </span>
      </div>

      <div />
      <div className="flex gap-x-4 flex-wrap text-muted">
        <span>
          CPU <span className="text-text">{cpu === null ? '—' : `${cpu.toFixed(1)}%`}</span>
        </span>
        <span>
          RAM <span className="text-text">{ram === null ? '—' : `${ram.toFixed(1)}%`}</span>
        </span>
        <span>
          NET <span className="text-cyan">↓</span>{' '}
          <span className="text-text">{fmtRate(net.rx)}</span>
          <span className="text-muted"> · </span>
          <span className="text-cyan">↑</span>{' '}
          <span className="text-text">{fmtRate(net.tx)}</span>
        </span>
      </div>
    </section>
  );
}
