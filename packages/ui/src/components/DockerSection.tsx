import type { DockerContainer } from '@homelab/shared';
import { fmtBytes, fmtPercent } from '../lib/format';

function shortImage(image: string): string {
  let s = image;
  if (s.endsWith(':latest')) s = s.slice(0, -7);
  if (s.startsWith('docker.io/')) s = s.slice('docker.io/'.length);
  return s;
}

export function DockerSection({ containers }: { containers: DockerContainer[] }) {
  if (containers.length === 0) return null;
  const running = containers.filter((c) => c.status === 'running').length;
  return (
    <div className="pt-2 mt-2 border-t border-dashed border-border">
      <div className="text-muted text-[11px] mb-1 tracking-wide">
        ▸ docker — {running} running
        {containers.length > running && ` · ${containers.length - running} other`}
      </div>
      <ul className="space-y-px">
        {containers.map((c) => {
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
