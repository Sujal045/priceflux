export const PACKAGE_NAME = '@priceflux/db' as const;

export { loadDatabaseConfig, type DatabaseConfig } from './config.js';
export {
  createDatabase,
  type Database,
  type DatabaseHandle,
} from './client.js';
export {
  migrationsFolder,
  runMigrations,
} from './migrate.js';
export {
  users,
  watches,
  priceHistory,
  type User,
  type NewUser,
  type Watch,
  type NewWatch,
  type PriceHistoryRow,
  type NewPriceHistoryRow,
} from './schema.js';
