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

// Inline schema bootstrap + small in-place migrations.
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

// Add net_rx_rate / net_tx_rate to existing DBs that pre-date the network history.
const existingCols = sqlite
  .prepare("PRAGMA table_info('snapshots')")
  .all() as { name: string }[];
const colNames = new Set(existingCols.map((c) => c.name));
if (!colNames.has('net_rx_rate')) {
  sqlite.exec("ALTER TABLE snapshots ADD COLUMN net_rx_rate INTEGER");
}
if (!colNames.has('net_tx_rate')) {
  sqlite.exec("ALTER TABLE snapshots ADD COLUMN net_tx_rate INTEGER");
}
if (!colNames.has('io_read_rate')) {
  sqlite.exec("ALTER TABLE snapshots ADD COLUMN io_read_rate INTEGER");
}
if (!colNames.has('io_write_rate')) {
  sqlite.exec("ALTER TABLE snapshots ADD COLUMN io_write_rate INTEGER");
}

logger.info({ path: dbPath }, 'sqlite ready');

export const db = drizzle(sqlite, { schema });
