import { WsMessage } from '@homelab/shared';
import { useStore } from '../store';
import { wsUrl } from './env';

const MAX_BACKOFF_MS = 30_000;

export function connectWebSocket(): () => void {
  let socket: WebSocket | null = null;
  let attempts = 0;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (stopped) return;
    useStore.getState().setWsStatus('connecting');

    try {
      socket = new WebSocket(wsUrl());
    } catch (err) {
      console.error('ws constructor failed', err);
      useStore.getState().setWsStatus('error');
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempts = 0;
      useStore.getState().setWsStatus('open');
    };

    socket.onmessage = (evt) => {
      if (typeof evt.data !== 'string') return;
      let raw: unknown;
      try {
        raw = JSON.parse(evt.data);
      } catch {
        return;
      }
      const parsed = WsMessage.safeParse(raw);
      if (!parsed.success) {
        console.warn('ws message failed schema check', parsed.error.issues);
        return;
      }
      if (parsed.data.type === 'state') {
        useStore.getState().applyStateMessage(parsed.data);
      }
    };

    socket.onerror = () => {
      useStore.getState().setWsStatus('error');
    };

    socket.onclose = () => {
      useStore.getState().setWsStatus('closed');
      if (!stopped) scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempts);
    attempts += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket && socket.readyState <= 1) socket.close();
  };
}
