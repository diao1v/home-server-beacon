import { z } from 'zod';
import { MetricsSnapshot } from './metrics.js';

export const ServerStatusSchema = z.enum(['online', 'degraded', 'offline']);
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

/**
 * Wire/serialized shape of a server's monitoring state.
 * Both the monitor (sender) and the UI (receiver) parse against this.
 */
export const ServerStateView = z.object({
  id: z.string(),
  displayName: z.string(),
  status: ServerStatusSchema,
  lastSeen: z.number().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  latestSnapshot: MetricsSnapshot.nullable(),
  lastError: z.string().nullable(),
});
export type ServerStateView = z.infer<typeof ServerStateView>;

export const WsStateMessage = z.object({
  type: z.literal('state'),
  timestamp: z.number(),
  servers: z.array(ServerStateView),
});
export type WsStateMessage = z.infer<typeof WsStateMessage>;

export const WsMessage = z.discriminatedUnion('type', [WsStateMessage]);
export type WsMessage = z.infer<typeof WsMessage>;
