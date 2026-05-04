import { useStore } from '../store';

function avg(values: ReadonlyArray<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function Footer() {
  const servers = useStore((s) => s.servers);
  if (servers.length === 0) return null;
  const counts = { online: 0, degraded: 0, offline: 0 };
  for (const s of servers) counts[s.status] += 1;
  const cpu = avg(servers.map((s) => s.latestSnapshot?.os.cpuPercent));
  const ram = avg(servers.map((s) => s.latestSnapshot?.os.memory.usedPercent));
  return (
    <footer className="mt-6 pt-2 border-t border-border text-muted text-[11px] flex justify-between">
      <span>
        {servers.length} servers · {counts.online} online · {counts.degraded} degraded ·{' '}
        {counts.offline} offline
      </span>
      <span>
        fleet cpu <span className="text-text">{cpu === null ? '—' : `${cpu.toFixed(1)}%`}</span> ·
        ram <span className="text-text">{ram === null ? '—' : `${ram.toFixed(1)}%`}</span>
      </span>
    </footer>
  );
}
