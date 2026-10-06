import { randomUUID } from 'node:crypto';

import { tryClaimUrlDedupe, type PricefluxRedis } from '@priceflux/cache';
import {
  DEFAULT_MAX_ATTEMPTS,
  ScrapeJobSchema,
} from '@priceflux/shared';

import type { RabbitConnection } from './connection.js';
import { publishScrapeJob } from './publish.js';

export type WatchEnqueueInput = {
  watchId: string;
  userId: string;
  url: string;
  canonicalUrl: string;
  dedupeKey: string;
  site: string | null;
  threshold: number | null;
  currency: string | null;
};

export type EnqueueWatchScrapeResult =
  | { scrapeQueued: true; jobId: string }
  | { scrapeQueued: false; dedupeTtlSeconds: number };

/**
 * Claim URL dedupe (Redis) and publish a scrape job for a persisted watch.
 * Shared by the API (on create) and the scheduler (periodic re-scrape).
 */
export async function tryEnqueueWatchScrape(input: {
  redis: PricefluxRedis;
  rabbit: RabbitConnection;
  watch: WatchEnqueueInput;
  dedupeTtlSeconds?: number;
}): Promise<EnqueueWatchScrapeResult> {
  const { redis, rabbit, watch } = input;
  const claim = await tryClaimUrlDedupe(
    redis,
    watch.dedupeKey,
    input.dedupeTtlSeconds,
  );
  if (!claim.claimed) {
    return { scrapeQueued: false, dedupeTtlSeconds: claim.ttlSeconds };
  }

  const job = ScrapeJobSchema.parse({
    jobId: randomUUID(),
    url: watch.url,
    canonicalUrl: watch.canonicalUrl,
    dedupeKey: watch.dedupeKey,
    userId: watch.userId,
    watchId: watch.watchId,
    ...(watch.site ? { site: watch.site } : {}),
    ...(watch.threshold !== null ? { threshold: watch.threshold } : {}),
    ...(watch.currency ? { currency: watch.currency } : {}),
    requestedAt: new Date().toISOString(),
  });

  await publishScrapeJob(rabbit.channel, {
    job,
    headers: {
      'x-attempt': 1,
      'x-max-attempts': DEFAULT_MAX_ATTEMPTS,
      'x-dedupe-key': watch.dedupeKey,
    },
  });

  return { scrapeQueued: true, jobId: job.jobId };
}
