import type { DockerContainer } from '@homelab/shared';
import { fmtBytes, fmtPercent } from '../lib/format';

export function DockerSection({ containers }: { containers: DockerContainer[] }) {
  if (containers.length === 0) return null;
  const running = containers.filter((c) => c.status === 'running').length;
  return (
    <div className="pt-2 mt-2 border-t border-dashed border-border">
      <div className="text-muted text-[11px] mb-1 tracking-wide">
        ▸ docker — {running} running{containers.length > running && ` · ${containers.length - running} other`}
      </div>
      <ul className="space-y-px">
        {containers.map((c) => {
          const isRunning = c.status === 'running';
          return (
            <li
              key={c.id}
              className="grid grid-cols-[12px_1fr_60px_60px] gap-2 text-[11px] items-center"
            >
              <span className={isRunning ? 'text-green' : 'text-muted'}>
                {isRunning ? '●' : '○'}
              </span>
              <span className={isRunning ? '' : 'text-muted'}>{c.name}</span>
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
