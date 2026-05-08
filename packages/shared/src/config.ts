import { z } from 'zod';

export const ServerEntry = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  url: z.string().url(),
  apiKey: z.string().min(16, 'apiKey must be at least 16 characters'),
  /**
   * Short label (≤ 8 chars) used by the LED panel API. When omitted, the
   * /api/display endpoint truncates `displayName` instead. Optional.
   */
  ledName: z.string().min(1).max(8).optional(),
});
export type ServerEntry = z.infer<typeof ServerEntry>;

export const ServersConfig = z.object({
  servers: z.array(ServerEntry).min(1),
});
export type ServersConfig = z.infer<typeof ServersConfig>;

export const AlertsConfig = z.object({
  mailgun: z.object({
    apiKey: z.string().min(1),
    domain: z.string().min(1),
    from: z.string().min(1),
  }),
  to: z.string().email(),
  enabled: z.boolean().default(true),
  cooldownMinutes: z.number().int().positive().default(30),
});
export type AlertsConfig = z.infer<typeof AlertsConfig>;
