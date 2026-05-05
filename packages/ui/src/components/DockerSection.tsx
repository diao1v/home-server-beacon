import type { DockerContainer } from '@homelab/shared';
import { fmtBytes, fmtPercent } from '../lib/format';

function byLoad(a: DockerContainer, b: DockerContainer): number {
  const cpuDiff = (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0);
  if (cpuDiff !== 0) return cpuDiff;
  return (b.memory.used ?? 0) - (a.memory.used ?? 0);
}

const ROW_GRID = 'grid grid-cols-[12px_1fr_60px_60px] gap-2';

export function DockerSection({ containers }: { containers: DockerContainer[] }) {
  if (containers.length === 0) return null;
  const running = containers.filter((c) => c.status === 'running').length;
  const sorted = [...containers].sort(byLoad);

  return (
    <div className="pt-2 mt-2 border-t border-dashed border-border">
      <div className="text-muted text-[11px] mb-1 tracking-wide">
        ▸ docker — {running} running
        {containers.length > running && ` · ${containers.length - running} other`}
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
        {sorted.map((c) => {
          const isRunning = c.status === 'running';
          return (
            <li key={c.id} className={`${ROW_GRID} text-[11px] items-center`}>
              <span className={isRunning ? 'text-green' : 'text-muted'}>
                {isRunning ? '●' : '○'}
              </span>
              <span className={`truncate ${isRunning ? '' : 'text-muted'}`} title={c.image}>
                {c.name}
              </span>
              <span className="text-right text-muted">{fmtPercent(c.cpuPercent)}</span>
              <span className="text-right text-muted">
                {isRunning ? fmtBytes(c.memory.used) : c.status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
