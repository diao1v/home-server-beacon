import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const snapshots = sqliteTable(
  'snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serverId: text('server_id').notNull(),
    timestamp: integer('timestamp').notNull(),
    cpuPercent: real('cpu_percent'),
    memPercent: real('mem_percent'),
    diskPercent: real('disk_percent'),
    rawJson: text('raw_json').notNull(),
  },
  (table) => ({
    byServerTs: index('idx_snapshots_server_ts').on(table.serverId, table.timestamp),
  }),
);

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
