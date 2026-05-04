import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { env } from './env.js';

const expected = Buffer.from(env.API_KEY);

export const bearerAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'missing bearer token' }, 401);
  }
  const provided = Buffer.from(header.slice('Bearer '.length).trim());
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return c.json({ error: 'invalid token' }, 401);
  }
  await next();
};
