import { eq } from 'drizzle-orm';

import {
  priceHistory,
  users,
  watches,
  type Database,
} from '@priceflux/db';
import type { ScrapeResult } from '@priceflux/shared';

import type { AlertEmitter, PriceAlert } from './alert.js';

export type HandleResultOutcome = {
  /** True when a new price_history row was inserted. */
  inserted: boolean;
  /** True when a drop alert was emitted. */
  alerted: boolean;
  reason?:
    | 'missing_watch_id'
    | 'watch_not_found'
    | 'watch_inactive'
    | 'duplicate_job'
    | 'no_threshold'
    | 'currency_mismatch'
    | 'above_threshold';
};

export type HandleScrapeResultOptions = {
  onAlert: AlertEmitter;
};

/**
 * Persist a scrape result and maybe emit a threshold alert.
 * Idempotent on `jobId` (unique index) — duplicates ack without re-alerting.
 */
export async function handleScrapeResult(
  db: Database,
  result: ScrapeResult,
  options: HandleScrapeResultOptions,
): Promise<HandleResultOutcome> {
  if (!result.watchId) {
    return { inserted: false, alerted: false, reason: 'missing_watch_id' };
  }

  const watchRows = await db
    .select({
      id: watches.id,
      userId: watches.userId,
      active: watches.active,
      threshold: watches.threshold,
      currency: watches.currency,
      email: users.email,
    })
    .from(watches)
    .innerJoin(users, eq(users.id, watches.userId))
    .where(eq(watches.id, result.watchId))
    .limit(1);

  const watch = watchRows[0];
  if (!watch) {
    return { inserted: false, alerted: false, reason: 'watch_not_found' };
  }
  if (!watch.active) {
    return { inserted: false, alerted: false, reason: 'watch_inactive' };
  }

  const inserted = await db
    .insert(priceHistory)
    .values({
      watchId: watch.id,
      jobId: result.jobId,
      price: result.price.toFixed(2),
      currency: result.currency,
      title: result.title,
      source: result.source,
      scrapedAt: new Date(result.scrapedAt),
    })
    .onConflictDoNothing({ target: priceHistory.jobId })
    .returning({ id: priceHistory.id });

  if (inserted.length === 0) {
    return { inserted: false, alerted: false, reason: 'duplicate_job' };
  }

  if (watch.threshold === null) {
    return { inserted: true, alerted: false, reason: 'no_threshold' };
  }

  const threshold = Number(watch.threshold);
  if (!Number.isFinite(threshold)) {
    return { inserted: true, alerted: false, reason: 'no_threshold' };
  }

  if (watch.currency && watch.currency !== result.currency) {
    return { inserted: true, alerted: false, reason: 'currency_mismatch' };
  }

  // Alert when price hits or drops under the user's target.
  if (result.price > threshold) {
    return { inserted: true, alerted: false, reason: 'above_threshold' };
  }

  const alert: PriceAlert = {
    jobId: result.jobId,
    watchId: watch.id,
    userId: watch.userId,
    email: watch.email,
    url: result.url,
    canonicalUrl: result.canonicalUrl,
    price: result.price,
    currency: result.currency,
    threshold,
    scrapedAt: result.scrapedAt,
    ...(result.title !== undefined ? { title: result.title } : {}),
  };

  await options.onAlert(alert);
  return { inserted: true, alerted: true };
}
