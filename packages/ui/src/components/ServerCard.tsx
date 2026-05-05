import type { ServerStateView } from '@homelab/shared';
import {
  deriveStatus,
  fmtAgo,
  fmtBytesPair,
  fmtPercent,
  fmtRate,
  fmtTemp,
  pickPrimaryNetwork,
} from '../lib/format';
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

// Map raw °C to bar fill: 30°C empty, 90°C full. Aligns existing
// green/amber/red thresholds (60/85) to ~66°C amber, ~81°C red.
function tempBarPercent(c: number): number {
  return Math.max(0, Math.min(100, ((c - 30) / 60) * 100));
}

export function ServerCard({ server }: { server: ServerStateView }) {
  const history = useStore((s) => s.history[server.id]) ?? [];
  const cpuValues = history.map((p) => p.cpu);
  const ramValues = history.map((p) => p.mem);
  const snap = server.latestSnapshot;
  const primaryNet = snap ? pickPrimaryNetwork(snap.os.network) : null;

  const status = deriveStatus(server);
  const isWaiting = status === 'waiting';
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
          <ResourceBar
            label="CPU"
            barValue={snap?.os.cpuPercent ?? null}
            valueText={fmtPercent(snap?.os.cpuPercent ?? null)}
          />
          <ResourceBar
            label="RAM"
            barValue={snap?.os.memory.usedPercent ?? null}
            valueText={
              snap ? fmtBytesPair(snap.os.memory.used, snap.os.memory.total) : '—'
            }
          />
          {typeof snap?.os.temperature === 'number' && (
            <ResourceBar
              label="TMP"
              barValue={tempBarPercent(snap.os.temperature)}
              valueText={fmtTemp(snap.os.temperature)}
            />
          )}
          {snap?.os.disks.map((d) => (
            <div key={d.mount}>
              <ResourceBar
                label={d.mount}
                barValue={d.usedPercent}
                valueText={fmtBytesPair(d.used, d.total)}
              />
              {d.mountpoints !== undefined && (
                <div
                  className="text-[10px] text-muted -mt-0.5 mb-1 pl-[88px] truncate"
                  title={
                    d.mountpoints.length === 0 ? 'unmounted' : d.mountpoints.join(' · ')
                  }
                >
                  ↳ {d.mountpoints.length === 0 ? 'unmounted' : d.mountpoints.join(' · ')}
                </div>
              )}
            </div>
          ))}

          {primaryNet && (
            <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-center text-xs my-1">
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
