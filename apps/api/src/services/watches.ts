import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import {
  tryClaimUrlDedupe,
  type PricefluxRedis,
} from '@priceflux/cache';
import { users, watches, type Database, type Watch } from '@priceflux/db';
import { publishScrapeJob, type RabbitConnection } from '@priceflux/mq';
import {
  DEFAULT_MAX_ATTEMPTS,
  ScrapeJobSchema,
  canonicalizeUrl,
  dedupeKeyForUrl,
} from '@priceflux/shared';

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
};

export type CreateWatchResult = {
  watch: WatchDto;
  created: boolean;
  scrapeQueued: boolean;
  jobId?: string;
  dedupeTtlSeconds?: number;
};

function siteFromUrl(canonicalUrl: string): string {
  return new URL(canonicalUrl).hostname;
}

function toDto(row: Watch): WatchDto {
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

  const claim = await tryClaimUrlDedupe(redis, dedupeKey);
  if (!claim.claimed) {
    return {
      watch: toDto(watchRow),
      created,
      scrapeQueued: false,
      dedupeTtlSeconds: claim.ttlSeconds,
    };
  }

  const job = ScrapeJobSchema.parse({
    jobId: randomUUID(),
    url: body.url,
    canonicalUrl,
    dedupeKey,
    userId: user.id,
    watchId: watchRow.id,
    site,
    ...(body.threshold !== undefined ? { threshold: body.threshold } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    requestedAt: new Date().toISOString(),
  });

  await publishScrapeJob(rabbit.channel, {
    job,
    headers: {
      'x-attempt': 1,
      'x-max-attempts': DEFAULT_MAX_ATTEMPTS,
      'x-dedupe-key': dedupeKey,
    },
  });

  return {
    watch: toDto(watchRow),
    created,
    scrapeQueued: true,
    jobId: job.jobId,
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
  return rows.map(toDto);
}

export async function getWatchById(
  db: Database,
  id: string,
): Promise<WatchDto | null> {
  const rows = await db.select().from(watches).where(eq(watches.id, id)).limit(1);
  const row = rows[0];
  return row ? toDto(row) : null;
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
  return row ? toDto(row) : null;
}

export async function deactivateWatchById(
  db: Database,
  id: string,
): Promise<WatchDto | null> {
  return updateWatchById(db, id, { active: false });
}
