import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { loadDatabaseConfig, type DatabaseConfig } from './config.js';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export type DatabaseHandle = {
  db: Database;
  /** Underlying postgres.js client — call `end()` on shutdown. */
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
};

export function createDatabase(
  config: DatabaseConfig = loadDatabaseConfig(),
): DatabaseHandle {
  const sql = postgres(config.url, { max: 10 });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
