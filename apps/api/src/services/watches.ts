import { and, desc, eq, inArray } from 'drizzle-orm';

import { type PricefluxRedis } from '@priceflux/cache';
import {
  priceHistory,
  users,
  watches,
  type Database,
  type PriceHistoryRow,
  type Watch,
} from '@priceflux/db';
import { tryEnqueueWatchScrape, type RabbitConnection } from '@priceflux/mq';
import { canonicalizeUrl, dedupeKeyForUrl } from '@priceflux/shared';

import type { CreateWatchBody, UpdateWatchBody } from '../routes/watches-schemas.js';

export type WatchDto = {
  id: string;
  userId: string;
  url: string;
  canonicalUrl: string;
  dedupeKey: string;
  site: string | null;
  threshold: number | null;
  currency: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Most recent scraped price (null until a scrape lands). */
  latestPrice: number | null;
  latestCurrency: string | null;
  /** `scraped_at` of the most recent price_history row. */
  lastCheckedAt: string | null;
};

export type PriceHistoryDto = {
  id: string;
  watchId: string;
  jobId: string;
  price: number;
  currency: string;
  title: string | null;
  source: string;
  scrapedAt: string;
  createdAt: string;
};

export type CreateWatchResult = {
  watch: WatchDto;
  created: boolean;
  scrapeQueued: boolean;
  jobId?: string;
  dedupeTtlSeconds?: number;
};

export type RecheckWatchResult = {
  watch: WatchDto;
  scrapeQueued: boolean;
  jobId?: string;
  dedupeTtlSeconds?: number;
};

/** Latest price snapshot for a watch, used to enrich `WatchDto`. */
type LatestPrice = {
  price: number;
  currency: string;
  scrapedAt: Date;
};

function siteFromUrl(canonicalUrl: string): string {
  return new URL(canonicalUrl).hostname;
}

function toDto(row: Watch, latest?: LatestPrice | null): WatchDto {
  return {
    id: row.id,
    userId: row.userId,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    dedupeKey: row.dedupeKey,
    site: row.site,
    threshold: row.threshold === null ? null : Number(row.threshold),
    currency: row.currency,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    latestPrice: latest ? latest.price : null,
    latestCurrency: latest ? latest.currency : null,
    lastCheckedAt: latest ? latest.scrapedAt.toISOString() : null,
  };
}

function toHistoryDto(row: PriceHistoryRow): PriceHistoryDto {
  return {
    id: row.id,
    watchId: row.watchId,
    jobId: row.jobId,
    price: Number(row.price),
    currency: row.currency,
    title: row.title,
    source: row.source,
    scrapedAt: row.scrapedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function ensureUser(db: Database, email: string) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    return existing[0];
  }
  const [created] = await db.insert(users).values({ email }).returning();
  if (!created) {
    throw new Error('Failed to create user');
  }
  return created;
}

/**
 * Latest price_history row per watch id (one query, `DISTINCT ON`).
 * Returned as a map keyed by watch id for cheap enrichment.
 */
async function latestPricesByWatchIds(
  db: Database,
  watchIds: string[],
): Promise<Map<string, LatestPrice>> {
  if (watchIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectDistinctOn([priceHistory.watchId], {
      watchId: priceHistory.watchId,
      price: priceHistory.price,
      currency: priceHistory.currency,
      scrapedAt: priceHistory.scrapedAt,
    })
    .from(priceHistory)
    .where(inArray(priceHistory.watchId, watchIds))
    .orderBy(priceHistory.watchId, desc(priceHistory.scrapedAt));

  return new Map(
    rows.map((row) => [
      row.watchId,
      {
        price: Number(row.price),
        currency: row.currency,
        scrapedAt: row.scrapedAt,
      },
    ]),
  );
}

function watchToEnqueueInput(row: Watch) {
  return {
    watchId: row.id,
    userId: row.userId,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    dedupeKey: row.dedupeKey,
    site: row.site,
    threshold: row.threshold === null ? null : Number(row.threshold),
    currency: row.currency,
  };
}

export async function createWatchAndMaybeEnqueue(input: {
  db: Database;
  redis: PricefluxRedis;
  rabbit: RabbitConnection;
  body: CreateWatchBody;
}): Promise<CreateWatchResult> {
  const { db, redis, rabbit, body } = input;
  const canonicalUrl = canonicalizeUrl(body.url);
  const dedupeKey = dedupeKeyForUrl(body.url);
  const site = siteFromUrl(canonicalUrl);
  const user = await ensureUser(db, body.email.toLowerCase());

  const existing = await db
    .select()
    .from(watches)
    .where(and(eq(watches.userId, user.id), eq(watches.dedupeKey, dedupeKey)))
    .limit(1);

  let watchRow: Watch;
  let created = false;

  if (existing[0]) {
    const [updated] = await db
      .update(watches)
      .set({
        url: body.url,
        canonicalUrl,
        site,
        threshold:
          body.threshold !== undefined ? body.threshold.toFixed(2) : existing[0].threshold,
        currency: body.currency !== undefined ? body.currency : existing[0].currency,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(watches.id, existing[0].id))
      .returning();
    if (!updated) {
      throw new Error('Failed to update watch');
    }
    watchRow = updated;
  } else {
    const [inserted] = await db
      .insert(watches)
      .values({
        userId: user.id,
        url: body.url,
        canonicalUrl,
        dedupeKey,
        site,
        threshold: body.threshold !== undefined ? body.threshold.toFixed(2) : undefined,
        currency: body.currency,
        active: true,
      })
      .returning();
    if (!inserted) {
      throw new Error('Failed to create watch');
    }
    watchRow = inserted;
    created = true;
  }

  const latest = created
    ? null
    : (await latestPricesByWatchIds(db, [watchRow.id])).get(watchRow.id) ?? null;

  const enqueue = await tryEnqueueWatchScrape({
    redis,
    rabbit,
    watch: watchToEnqueueInput(watchRow),
  });

  if (!enqueue.scrapeQueued) {
    return {
      watch: toDto(watchRow, latest),
      created,
      scrapeQueued: false,
      dedupeTtlSeconds: enqueue.dedupeTtlSeconds,
    };
  }

  return {
    watch: toDto(watchRow, latest),
    created,
    scrapeQueued: true,
    jobId: enqueue.jobId,
  };
}

/**
 * Enqueue a scrape for an existing watch (dedicated recheck).
 * Returns `null` when the watch id does not exist. Does not mutate the watch.
 */
export async function recheckWatchById(input: {
  db: Database;
  redis: PricefluxRedis;
  rabbit: RabbitConnection;
  id: string;
}): Promise<RecheckWatchResult | null> {
  const { db, redis, rabbit, id } = input;
  const rows = await db.select().from(watches).where(eq(watches.id, id)).limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }

  const latest = (await latestPricesByWatchIds(db, [row.id])).get(row.id) ?? null;
  const enqueue = await tryEnqueueWatchScrape({
    redis,
    rabbit,
    watch: watchToEnqueueInput(row),
  });

  if (!enqueue.scrapeQueued) {
    return {
      watch: toDto(row, latest),
      scrapeQueued: false,
      dedupeTtlSeconds: enqueue.dedupeTtlSeconds,
    };
  }

  return {
    watch: toDto(row, latest),
    scrapeQueued: true,
    jobId: enqueue.jobId,
  };
}

export async function listWatchesForEmail(
  db: Database,
  email: string,
): Promise<WatchDto[]> {
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  const user = userRows[0];
  if (!user) {
    return [];
  }
  const rows = await db.select().from(watches).where(eq(watches.userId, user.id));
  const latestByWatch = await latestPricesByWatchIds(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toDto(row, latestByWatch.get(row.id) ?? null));
}

export async function getWatchById(
  db: Database,
  id: string,
): Promise<WatchDto | null> {
  const rows = await db.select().from(watches).where(eq(watches.id, id)).limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const latest = (await latestPricesByWatchIds(db, [row.id])).get(row.id) ?? null;
  return toDto(row, latest);
}

/**
 * Price history for a watch, newest first. Caller validates the watch exists.
 */
export async function listPriceHistoryForWatch(
  db: Database,
  watchId: string,
  limit: number,
): Promise<PriceHistoryDto[]> {
  const rows = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.watchId, watchId))
    .orderBy(desc(priceHistory.scrapedAt))
    .limit(limit);
  return rows.map(toHistoryDto);
}

export async function updateWatchById(
  db: Database,
  id: string,
  body: UpdateWatchBody,
): Promise<WatchDto | null> {
  const patch: {
    threshold?: string | null;
    currency?: string | null;
    active?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (body.threshold !== undefined) {
    patch.threshold = body.threshold === null ? null : body.threshold.toFixed(2);
  }
  if (body.currency !== undefined) {
    patch.currency = body.currency;
  }
  if (body.active !== undefined) {
    patch.active = body.active;
  }

  const rows = await db.update(watches).set(patch).where(eq(watches.id, id)).returning();
  const row = rows[0];
  if (!row) {
    return null;
  }
  const latest = (await latestPricesByWatchIds(db, [row.id])).get(row.id) ?? null;
  return toDto(row, latest);
}

export async function deactivateWatchById(
  db: Database,
  id: string,
): Promise<WatchDto | null> {
  return updateWatchById(db, id, { active: false });
}
