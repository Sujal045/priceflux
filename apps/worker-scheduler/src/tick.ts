import { eq, inArray, max } from 'drizzle-orm';

import { type PricefluxRedis } from '@priceflux/cache';
import {
  priceHistory,
  watches,
  type Database,
} from '@priceflux/db';
import { tryEnqueueWatchScrape, type RabbitConnection } from '@priceflux/mq';

import { isWatchDue } from './due.js';

export type SchedulerTickResult = {
  activeWatches: number;
  dueWatches: number;
  enqueued: number;
  skippedDedupe: number;
  errors: number;
};

export type RunSchedulerTickOptions = {
  db: Database;
  redis: PricefluxRedis;
  rabbit: RabbitConnection;
  watchIntervalSeconds: number;
  now?: Date;
};

/**
 * Scan active watches and enqueue scrapes that are past their interval.
 * Respects the same Redis URL dedupe window as POST /watches.
 */
export async function runSchedulerTick(
  options: RunSchedulerTickOptions,
): Promise<SchedulerTickResult> {
  const watchIntervalMs = options.watchIntervalSeconds * 1000;
  const now = options.now ?? new Date();

  const activeRows = await options.db
    .select()
    .from(watches)
    .where(eq(watches.active, true));

  if (activeRows.length === 0) {
    return {
      activeWatches: 0,
      dueWatches: 0,
      enqueued: 0,
      skippedDedupe: 0,
      errors: 0,
    };
  }

  const watchIds = activeRows.map((row) => row.id);
  const lastScrapeRows = await options.db
    .select({
      watchId: priceHistory.watchId,
      lastScrapedAt: max(priceHistory.scrapedAt),
    })
    .from(priceHistory)
    .where(inArray(priceHistory.watchId, watchIds))
    .groupBy(priceHistory.watchId);

  const lastScrapeByWatch = new Map(
    lastScrapeRows.map((row) => [row.watchId, row.lastScrapedAt]),
  );

  const dueRows = activeRows.filter((watch) =>
    isWatchDue({
      lastScrapedAt: lastScrapeByWatch.get(watch.id) ?? null,
      watchCreatedAt: watch.createdAt,
      watchIntervalMs,
      now,
    }),
  );

  let enqueued = 0;
  let skippedDedupe = 0;
  let errors = 0;

  for (const watch of dueRows) {
    try {
      const result = await tryEnqueueWatchScrape({
        redis: options.redis,
        rabbit: options.rabbit,
        watch: {
          watchId: watch.id,
          userId: watch.userId,
          url: watch.url,
          canonicalUrl: watch.canonicalUrl,
          dedupeKey: watch.dedupeKey,
          site: watch.site,
          threshold:
            watch.threshold === null ? null : Number(watch.threshold),
          currency: watch.currency,
        },
      });

      if (result.scrapeQueued) {
        enqueued += 1;
      } else {
        skippedDedupe += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return {
    activeWatches: activeRows.length,
    dueWatches: dueRows.length,
    enqueued,
    skippedDedupe,
    errors,
  };
}
