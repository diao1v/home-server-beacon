import { useEffect, useRef } from 'react';
import { Footer } from './components/Footer';
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
    <div className="min-h-full px-6 py-4 pb-8">
      <Header />
      <main className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-3">
        {servers.length === 0 ? (
          <div className="text-muted text-xs col-span-full">waiting for first poll cycle…</div>
        ) : (
          servers.map((s) => <ServerCard key={s.id} server={s} />)
        )}
      </main>
      <Footer />
    </div>
  );
}
