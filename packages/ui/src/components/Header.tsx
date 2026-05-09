import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/api';
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
  const [polling, setPolling] = useState(false);

  // Tick once a second so `fmtAgo(lastUpdate)` re-evaluates against a fresh
  // Date.now(). Without this the component only re-renders on WS pushes
  // (every ~10s), which means "last poll" jumps from "0s" → "0s" → "0s"
  // and never actually counts up.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    if (polling) return;
    setPolling(true);
    try {
      await fetchJson('/api/poll', { method: 'POST' });
    } catch (err) {
      console.warn('manual poll failed', err);
    } finally {
      setPolling(false);
    }
  };

  return (
    <header className="border-b border-border pb-2 mb-4 flex flex-wrap justify-between items-baseline gap-x-3 gap-y-1 text-muted text-xs">
      <div className="text-text tracking-wider">
        <span className="text-green">$</span> homelab-monitor v0.0.1
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span>
          ws{' '}
          <span className={`${STATUS_COLOR[wsStatus] ?? 'text-text'} font-medium`}>
            {wsStatus}
          </span>
        </span>
        {lastUpdate !== null && (
          <span>
            last poll <span className="text-text">{fmtAgo(lastUpdate)}</span>
          </span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={polling || wsStatus !== 'open'}
          className="text-muted hover:text-cyan disabled:opacity-40 disabled:hover:text-muted transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Trigger an immediate poll cycle"
        >
          [{polling ? 'polling…' : 'refresh'}]
        </button>
      </div>
    </header>
  );
}
