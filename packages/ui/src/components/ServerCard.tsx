import type { ServerStateView } from '@homelab/shared';
import { fmtAgo } from '../lib/format';
import { useStore } from '../store';
import { DockerSection } from './DockerSection';
import { Pm2Section } from './Pm2Section';
import { ResourceBar } from './ResourceBar';
import { Sparkline } from './Sparkline';
import { StatusBadge } from './StatusBadge';

export function ServerCard({ server }: { server: ServerStateView }) {
  const history = useStore((s) => s.history[server.id]) ?? [];
  const cpuValues = history.map((p) => p.cpu);
  const ramValues = history.map((p) => p.mem);
  const snap = server.latestSnapshot;
  const primaryDisk = snap?.os.disks[0];

  return (
    <div className="term-card bg-panel border border-border p-3 px-3.5">
      <span className="corner-tr" aria-hidden />
      <span className="corner-bl" aria-hidden />

      <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-dashed border-border">
        <div>
          <div className="font-semibold tracking-wide text-text">{server.displayName}</div>
          <div className="text-muted text-[11px]">{server.id}</div>
        </div>
        <StatusBadge status={server.status} />
      </div>

      <ResourceBar label="CPU" value={snap?.os.cpuPercent ?? null} />
      <ResourceBar label="RAM" value={snap?.os.memory.usedPercent ?? null} />
      <ResourceBar label="DSK" value={primaryDisk?.usedPercent ?? null} />

      <Sparkline label="cpu 30m" values={cpuValues} />
      <Sparkline label="ram 30m" values={ramValues} />

      {snap?.docker && <DockerSection containers={snap.docker.containers} />}
      {snap?.pm2 && <Pm2Section processes={snap.pm2.processes} />}

      <div className="pt-2 mt-2 border-t border-dashed border-border flex justify-between text-muted text-[11px]">
        {server.status === 'offline' && server.lastError ? (
          <span className="text-red">! {server.lastError}</span>
        ) : (
          <span>
            last seen <span className="text-text">{fmtAgo(server.lastSeen)}</span>
          </span>
        )}
        <span>v{snap?.meta.version ?? '—'}</span>
      </div>
    </div>
  );
}
