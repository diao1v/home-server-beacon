import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '../env.js';
import { logger } from '../logger.js';
import * as schema from './schema.js';

const dbPath = resolve(process.cwd(), env.DB_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

export const sqlite: Database.Database = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('temp_store = MEMORY');
sqlite.pragma('foreign_keys = ON');

// Inline schema bootstrap. We'll switch to drizzle-kit migrations once the schema
// starts evolving — for v1 a single CREATE TABLE IF NOT EXISTS is enough.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cpu_percent REAL,
    mem_percent REAL,
    disk_percent REAL,
    raw_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_server_ts
    ON snapshots(server_id, timestamp DESC);
`);

logger.info({ path: dbPath }, 'sqlite ready');

export const db = drizzle(sqlite, { schema });
