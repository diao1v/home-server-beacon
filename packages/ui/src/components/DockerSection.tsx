import type { DockerContainer } from '@homelab/shared';
import { fmtBytes, fmtPercent } from '../lib/format';

function shortImage(image: string): string {
  let s = image;
  if (s.endsWith(':latest')) s = s.slice(0, -7);
  if (s.startsWith('docker.io/')) s = s.slice('docker.io/'.length);
  return s;
}

// Primary: highest CPU first. Secondary: heaviest RAM first.
// Pushes idle/static containers to the bottom so the busy ones lead.
function byLoad(a: DockerContainer, b: DockerContainer): number {
  const cpuDiff = (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0);
  if (cpuDiff !== 0) return cpuDiff;
  return (b.memory.used ?? 0) - (a.memory.used ?? 0);
}

export function DockerSection({ containers }: { containers: DockerContainer[] }) {
  if (containers.length === 0) return null;
  const running = containers.filter((c) => c.status === 'running').length;
  const sorted = [...containers].sort(byLoad);

  return (
    <div className="pt-2 mt-2 border-t border-dashed border-border">
      <div className="flex justify-between items-baseline mb-1">
        <div className="text-muted text-[11px] tracking-wide">
          ▸ docker — {running} running
          {containers.length > running && ` · ${containers.length - running} other`}
        </div>
        <div className="grid grid-cols-[60px_60px] gap-2 text-[10px] text-muted uppercase tracking-wider">
          <span className="text-right">cpu</span>
          <span className="text-right">ram</span>
        </div>
      </div>
      <ul className="space-y-px">
        {sorted.map((c) => {
          const isRunning = c.status === 'running';
          return (
            <li
              key={c.id}
              className="grid grid-cols-[12px_1fr_60px_60px] gap-2 text-[11px] items-start"
            >
              <span className={`leading-[1.4] ${isRunning ? 'text-green' : 'text-muted'}`}>
                {isRunning ? '●' : '○'}
              </span>
              <div className="min-w-0 leading-[1.4]">
                <div className={`truncate ${isRunning ? '' : 'text-muted'}`}>{c.name}</div>
                <div className="text-muted text-[10px] truncate">{shortImage(c.image)}</div>
              </div>
              <span className="text-right text-muted leading-[1.4]">
                {fmtPercent(c.cpuPercent)}
              </span>
              <span className="text-right text-muted leading-[1.4]">
                {isRunning ? fmtBytes(c.memory.used) : c.status}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
