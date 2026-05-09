import type { ServerStateView, WsStateMessage } from '@homelab/shared';
import { create } from 'zustand';
import { pickPrimaryNetwork } from './lib/format';

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface HistoryPoint {
  timestamp: number;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  netRx: number | null;
  netTx: number | null;
  ioRead: number | null;
  ioWrite: number | null;
}

const HISTORY_CAP = 4500; // ~12.5h at a 10s poll interval (12h sparkline + headroom)

interface MonitorStore {
  servers: ServerStateView[];
  history: Record<string, HistoryPoint[]>;
  lastUpdate: number | null;
  wsStatus: WsStatus;

  applyStateMessage: (msg: WsStateMessage) => void;
  setHistory: (serverId: string, rows: HistoryPoint[]) => void;
  setWsStatus: (status: WsStatus) => void;
}

function mergeHistory(existing: HistoryPoint[], incoming: HistoryPoint[]): HistoryPoint[] {
  const byTs = new Map<number, HistoryPoint>();
  for (const p of incoming) byTs.set(p.timestamp, p);
  for (const p of existing) byTs.set(p.timestamp, p); // existing wins
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-HISTORY_CAP);
}

export const useStore = create<MonitorStore>((set) => ({
  servers: [],
  history: {},
  lastUpdate: null,
  wsStatus: 'connecting',

  applyStateMessage: (msg) =>
    set((state) => {
      const history = { ...state.history };
      for (const s of msg.servers) {
        if (!s.latestSnapshot) continue;
        const snap = s.latestSnapshot;
        const primaryNet = pickPrimaryNetwork(snap.os.network);
        const point: HistoryPoint = {
          timestamp: msg.timestamp,
          cpu: snap.os.cpuPercent,
          mem: snap.os.memory.usedPercent,
          disk: snap.os.disks[0]?.usedPercent ?? null,
          netRx: primaryNet?.rxRate ?? null,
          netTx: primaryNet?.txRate ?? null,
          ioRead: snap.os.io?.readRate ?? null,
          ioWrite: snap.os.io?.writeRate ?? null,
        };
        const prev = history[s.id] ?? [];
        const last = prev[prev.length - 1];
        const next =
          last && last.timestamp === point.timestamp
            ? [...prev.slice(0, -1), point]
            : [...prev, point];
        history[s.id] = next.slice(-HISTORY_CAP);
      }
      return { servers: msg.servers, lastUpdate: msg.timestamp, history };
    }),

  setHistory: (serverId, rows) =>
    set((state) => ({
      history: {
        ...state.history,
        [serverId]: mergeHistory(state.history[serverId] ?? [], rows),
      },
    })),

  setWsStatus: (wsStatus) => set({ wsStatus }),
}));
