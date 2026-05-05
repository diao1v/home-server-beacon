import type { ServerStateView } from '@homelab/shared';
import { deriveStatus, fmtAgo, fmtRate, pickPrimaryNetwork } from '../lib/format';
import { useStore } from '../store';
import { DockerSection } from './DockerSection';
import { Pm2Section } from './Pm2Section';
import { ResourceBar } from './ResourceBar';
import { Sparkline } from './Sparkline';
import { StatusBadge } from './StatusBadge';

const BORDER_FOR_STATUS = {
  waiting: 'border-border',
  online: 'border-border',
  degraded: 'border-amber',
  offline: 'border-red',
} as const;

export function ServerCard({ server }: { server: ServerStateView }) {
  const history = useStore((s) => s.history[server.id]) ?? [];
  const cpuValues = history.map((p) => p.cpu);
  const ramValues = history.map((p) => p.mem);
  const snap = server.latestSnapshot;
  const primaryDisk = snap?.os.disks[0];
  const primaryNet = snap ? pickPrimaryNetwork(snap.os.network) : null;

  const status = deriveStatus(server);
  const isWaiting = status === 'waiting';
  // Stale = we have last-known data but the server is unreachable now. Dim the body
  // so the user reads it as "frozen" rather than "current".
  const isStale = status === 'offline' && snap !== null;

  return (
    <div
      className={`term-card bg-panel border ${BORDER_FOR_STATUS[status]} p-3 px-3.5 ${
        isWaiting ? 'opacity-60' : ''
      }`}
    >
      <span className="corner-tr" aria-hidden />
      <span className="corner-bl" aria-hidden />

      <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-dashed border-border">
        <div>
          <div className="font-semibold tracking-wide text-text">{server.displayName}</div>
          <div className="text-muted text-[11px]">{server.id}</div>
        </div>
        <StatusBadge status={status} />
      </div>

      {isWaiting ? (
        <div className="text-muted text-xs py-6 text-center tracking-wide">
          ○ waiting for first poll…
        </div>
      ) : (
        <div className={isStale ? 'opacity-50' : ''}>
          <ResourceBar label="CPU" value={snap?.os.cpuPercent ?? null} />
          <ResourceBar label="RAM" value={snap?.os.memory.usedPercent ?? null} />
          <ResourceBar label="DSK" value={primaryDisk?.usedPercent ?? null} />

          {primaryNet && (
            <div className="grid grid-cols-[36px_1fr_auto] gap-2 items-center text-xs my-1">
              <span className="text-muted">NET</span>
              <span>
                <span className="text-cyan">↓</span>{' '}
                <span className="text-text">{fmtRate(primaryNet.rxRate)}</span>
                <span className="text-muted"> · </span>
                <span className="text-cyan">↑</span>{' '}
                <span className="text-text">{fmtRate(primaryNet.txRate)}</span>
              </span>
              <span className="text-muted text-[10px]">{primaryNet.iface}</span>
            </div>
          )}

          <Sparkline label="cpu 30m" values={cpuValues} />
          <Sparkline label="ram 30m" values={ramValues} />

          {snap?.docker && <DockerSection containers={snap.docker.containers} />}
          {snap?.pm2 && <Pm2Section processes={snap.pm2.processes} />}
        </div>
      )}

      <div className="pt-2 mt-2 border-t border-dashed border-border flex justify-between text-muted text-[11px]">
        {isWaiting ? (
          <>
            <span>no data yet</span>
            <span>—</span>
          </>
        ) : status === 'offline' ? (
          <>
            <span className="text-red truncate">! {server.lastError ?? 'unreachable'}</span>
            <span className="shrink-0 ml-2">
              last seen <span className="text-text">{fmtAgo(server.lastSeen)}</span>
            </span>
          </>
        ) : status === 'degraded' ? (
          <>
            <span className="text-amber">
              ! {server.consecutiveFailures}/3 failures
              {server.lastError && (
                <span className="text-muted"> — {server.lastError}</span>
              )}
            </span>
            <span className="shrink-0 ml-2">
              <span className="text-text">{fmtAgo(server.lastSeen)}</span>
            </span>
          </>
        ) : (
          <>
            <span>
              last seen <span className="text-text">{fmtAgo(server.lastSeen)}</span>
            </span>
            <span>v{snap?.meta.version ?? '—'}</span>
          </>
        )}
      </div>
    </div>
  );
}
