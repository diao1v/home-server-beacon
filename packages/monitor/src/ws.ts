import { type WsStateMessage } from '@homelab/shared';
import { createNodeWebSocket } from '@hono/node-ws';
import type { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import { logger } from './logger.js';
import { pollerEvents } from './poller.js';
import { state } from './state.js';

const clients = new Set<WSContext>();

function buildStateMessage(): WsStateMessage {
  return {
    type: 'state',
    timestamp: Date.now(),
    servers: state.all(),
  };
}

function broadcast(): void {
  if (clients.size === 0) return;
  const payload = JSON.stringify(buildStateMessage());
  for (const ws of clients) {
    try {
      ws.send(payload);
    } catch (err) {
      logger.warn({ err }, 'ws send failed');
    }
  }
}

export function setupWebSocket(app: Hono) {
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

  app.get(
    '/ws',
    upgradeWebSocket(() => ({
      onOpen: (_evt, ws) => {
        clients.add(ws);
        try {
          ws.send(JSON.stringify(buildStateMessage()));
        } catch (err) {
          logger.warn({ err }, 'ws initial send failed');
        }
        logger.debug({ clients: clients.size }, 'ws client connected');
      },
      onClose: (_evt, ws) => {
        clients.delete(ws);
        logger.debug({ clients: clients.size }, 'ws client disconnected');
      },
      onError: (evt, ws) => {
        clients.delete(ws);
        logger.warn({ err: evt }, 'ws client error');
      },
    })),
  );

  pollerEvents.on('cycle', broadcast);

  return { injectWebSocket };
}
