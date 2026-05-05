import type { ServerStateView } from '@homelab/shared';
import { useStore } from '../store';

interface Highlight {
  name: string;
  value: number;
}

function findHottestCpu(servers: ServerStateView[]): Highlight | null {
  let best: Highlight | null = null;
  for (const s of servers) {
    const cpu = s.latestSnapshot?.os.cpuPercent;
    if (typeof cpu !== 'number' || Number.isNaN(cpu)) continue;
    if (!best || cpu > best.value) best = { name: s.displayName, value: cpu };
  }
  return best;
}

function findFullestDisk(servers: ServerStateView[]): Highlight | null {
  let best: Highlight | null = null;
  for (const s of servers) {
    const disk = s.latestSnapshot?.os.disks[0]?.usedPercent;
    if (typeof disk !== 'number' || Number.isNaN(disk)) continue;
    if (!best || disk > best.value) best = { name: s.displayName, value: disk };
  }
  return best;
}

function colorFor(percent: number): string {
  if (percent > 85) return 'text-red';
  if (percent > 60) return 'text-amber';
  return 'text-green';
}

export function FleetSummary() {
  const servers = useStore((s) => s.servers);
  if (servers.length === 0) return null;

  const counts = { online: 0, degraded: 0, offline: 0 };
  for (const s of servers) counts[s.status] += 1;

  const hottest = findHottestCpu(servers);
  const fullest = findFullestDisk(servers);

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
      <div className="flex gap-x-6 flex-wrap text-muted">
        <span>
          hot:{' '}
          {hottest ? (
            <>
              <span className="text-text">{hottest.name}</span>{' '}
              <span className={colorFor(hottest.value)}>{hottest.value.toFixed(1)}%</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
        <span>
          disk:{' '}
          {fullest ? (
            <>
              <span className="text-text">{fullest.name}</span>{' '}
              <span className={colorFor(fullest.value)}>{fullest.value.toFixed(1)}%</span>
            </>
          ) : (
            <span className="text-muted">—</span>
          )}
        </span>
      </div>
    </section>
  );
}
