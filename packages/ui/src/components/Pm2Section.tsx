import type { Pm2Process } from '@homelab/shared';
import { fmtPercent } from '../lib/format';

function byLoad(a: Pm2Process, b: Pm2Process): number {
  const cpuDiff = (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0);
  if (cpuDiff !== 0) return cpuDiff;
  return (b.memoryMb ?? 0) - (a.memoryMb ?? 0);
}

const ROW_GRID = 'grid grid-cols-[12px_1fr_60px_60px] gap-2';

export function Pm2Section({ processes }: { processes: Pm2Process[] }) {
  if (processes.length === 0) return null;
  const online = processes.filter((p) => p.status === 'online').length;
  const sorted = [...processes].sort(byLoad);

  return (
    <div className="pt-2 mt-2 border-t border-dashed border-border">
      <div className="text-muted text-[11px] mb-1 tracking-wide">
        ▸ pm2 — {online}/{processes.length} online
      </div>

      <div
        className={`${ROW_GRID} text-[10px] text-muted uppercase tracking-wider pb-0.5 mb-1 border-b border-dotted border-border`}
      >
        <span />
        <span>name</span>
        <span className="text-right">cpu</span>
        <span className="text-right">ram</span>
      </div>

      <ul className="space-y-px">
        {sorted.map((p) => {
          const isOnline = p.status === 'online';
          const isErrored = p.status === 'errored';
          const dotColor = isErrored
            ? 'text-red'
            : isOnline
              ? 'text-green'
              : 'text-muted';
          return (
            <li key={p.name} className={`${ROW_GRID} text-[11px] items-center`}>
              <span className={dotColor}>●</span>
              <span className={isErrored ? 'text-red' : isOnline ? '' : 'text-muted'}>
                {p.name}
              </span>
              <span className="text-right text-muted">{fmtPercent(p.cpuPercent)}</span>
              <span className={`text-right ${isErrored ? 'text-red' : 'text-muted'}`}>
                {isOnline ? `${p.memoryMb.toFixed(0)}M` : p.status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
