import { fmtAgo } from '../lib/format';
import { useStore } from '../store';

const STATUS_COLOR: Record<string, string> = {
  connecting: 'text-amber',
  open: 'text-green',
  closed: 'text-muted',
  error: 'text-red',
};

export function Header() {
  const wsStatus = useStore((s) => s.wsStatus);
  const lastUpdate = useStore((s) => s.lastUpdate);
  return (
    <header className="border-b border-border pb-2 mb-4 flex justify-between items-baseline text-muted text-xs">
      <div className="text-text tracking-wider">
        <span className="text-green">$</span> homelab-monitor v0.0.1
      </div>
      <div>
        ws <span className={`${STATUS_COLOR[wsStatus] ?? 'text-text'} font-medium`}>{wsStatus}</span>
        {lastUpdate !== null && (
          <>
            {' · last poll '}
            <span className="text-text">{fmtAgo(lastUpdate)}</span>
          </>
        )}
      </div>
    </header>
  );
}
