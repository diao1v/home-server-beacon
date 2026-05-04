import pino from 'pino';
import { env } from './env.js';

const isDev = env.NODE_ENV !== 'production';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { serverId: env.SERVER_ID },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }
    : {}),
});
