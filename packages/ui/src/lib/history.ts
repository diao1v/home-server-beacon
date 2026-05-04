import { type HistoryPoint, useStore } from '../store';
import { fetchJson } from './api';

interface HistoryResponse {
  serverId: string;
  since: number;
  rows: HistoryPoint[];
}

export async function fetchHistoryFor(serverId: string, minutes = 30): Promise<void> {
  try {
    const res = await fetchJson<HistoryResponse>(`/api/history/${serverId}?minutes=${minutes}`);
    useStore.getState().setHistory(serverId, res.rows);
  } catch (err) {
    console.warn('history fetch failed', serverId, err);
  }
}

export async function fetchAllHistory(minutes = 30): Promise<void> {
  const ids = useStore.getState().servers.map((s) => s.id);
  await Promise.all(ids.map((id) => fetchHistoryFor(id, minutes)));
}
