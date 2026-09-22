import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  /** Optional hashed API key for v1 thin auth (populated in a later PR). */
  apiKeyHash: text('api_key_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_uidx').on(table.email),
]);

export const watches = pgTable('watches', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  canonicalUrl: text('canonical_url').notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  site: text('site'),
  threshold: numeric('threshold', { precision: 12, scale: 2 }),
  currency: text('currency'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('watches_user_dedupe_uidx').on(table.userId, table.dedupeKey),
  index('watches_dedupe_key_idx').on(table.dedupeKey),
  index('watches_user_id_idx').on(table.userId),
]);

export const priceHistory = pgTable('price_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  watchId: uuid('watch_id')
    .notNull()
    .references(() => watches.id, { onDelete: 'cascade' }),
  /** Scrape job id — unique for idempotent writes from the notifier. */
  jobId: uuid('job_id').notNull(),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  title: text('title'),
  source: text('source').notNull(),
  scrapedAt: timestamp('scraped_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('price_history_job_id_uidx').on(table.jobId),
  index('price_history_watch_id_idx').on(table.watchId),
  index('price_history_scraped_at_idx').on(table.scrapedAt),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Watch = typeof watches.$inferSelect;
export type NewWatch = typeof watches.$inferInsert;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type NewPriceHistoryRow = typeof priceHistory.$inferInsert;
