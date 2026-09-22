import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { loadDatabaseConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to SQL migrations shipped with this package. */
export function migrationsFolder(): string {
  // Published layout: dist/*.js → ../drizzle
  // Dev via tsx: src/*.ts → ../drizzle
  return path.resolve(__dirname, '../drizzle');
}

export async function runMigrations(
  databaseUrl: string = loadDatabaseConfig().url,
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  try {
    await migrate(db, { migrationsFolder: migrationsFolder() });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
