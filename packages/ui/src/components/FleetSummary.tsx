import type { ServerStateView } from '@homelab/shared';
import { useStore } from '../store';

interface Highlight {
  name: string;
  value: number;
}

function findMaxBy<T>(
  servers: ServerStateView[],
  pick: (s: ServerStateView) => number | null | undefined,
): Highlight | null {
  let best: Highlight | null = null;
  for (const s of servers) {
    const v = pick(s);
    if (typeof v !== 'number' || Number.isNaN(v)) continue;
    if (!best || v > best.value) best = { name: s.displayName, value: v };
  }
  return best;
}

function colorFor(percent: number): string {
  if (percent > 85) return 'text-red';
  if (percent > 60) return 'text-amber';
  return 'text-green';
}

function HighlightCell({ label, h }: { label: string; h: Highlight | null }) {
  return (
    <span>
      {label}:{' '}
      {h ? (
        <>
          <span className="text-text">{h.name}</span>{' '}
          <span className={colorFor(h.value)}>{h.value.toFixed(1)}%</span>
        </>
      ) : (
        <span className="text-muted">—</span>
      )}
    </span>
  );
}

export function FleetSummary() {
  const servers = useStore((s) => s.servers);
  if (servers.length === 0) return null;

  const counts = { online: 0, degraded: 0, offline: 0 };
  for (const s of servers) counts[s.status] += 1;

  const hotCpu = findMaxBy(servers, (s) => s.latestSnapshot?.os.cpuPercent);
  const hotRam = findMaxBy(servers, (s) => s.latestSnapshot?.os.memory.usedPercent);
  const hotDsk = findMaxBy(servers, (s) => s.latestSnapshot?.os.disks[0]?.usedPercent);

  return (
    <section className="bg-panel border border-border px-3.5 py-2 mb-3 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-cyan tracking-widest">[FLEET]</span>
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

      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-muted">
        <HighlightCell label="cpu" h={hotCpu} />
        <HighlightCell label="ram" h={hotRam} />
        <HighlightCell label="disk" h={hotDsk} />
      </div>
    </section>
  );
}
