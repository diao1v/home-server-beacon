import { useEffect, useRef } from 'react';
import { FleetSummary } from './components/FleetSummary';
import { Header } from './components/Header';
import { ServerCard } from './components/ServerCard';
import { fetchAllHistory } from './lib/history';
import { connectWebSocket } from './lib/ws';
import { useStore } from './store';

export function App() {
  const servers = useStore((s) => s.servers);

  useEffect(() => connectWebSocket(), []);

  // Backfill history once we know the server list (delivered by the first WS state push).
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (servers.length > 0 && !backfilledRef.current) {
      backfilledRef.current = true;
      fetchAllHistory();
    }
  }, [servers]);

  return (
    <div className="min-h-full px-3 py-3 sm:px-6 sm:py-4 pb-8 max-w-[1600px] mx-auto">
      <Header />
      <FleetSummary />
      <main
        className="
          grid gap-3
          grid-cols-1
          md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]
        "
      >
        {servers.length === 0 ? (
          <div className="text-muted text-xs col-span-full">waiting for first poll cycle…</div>
        ) : (
          servers.map((s) => <ServerCard key={s.id} server={s} />)
        )}
      </main>
    </div>
  );
}
