import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { eq } from 'drizzle-orm';

import {
  createDatabase,
  priceHistory,
  runMigrations,
  users,
  watches,
  type DatabaseHandle,
} from '@priceflux/db';
import {
  assertTopology,
  connectRabbitMq,
  publishScrapeResult,
  type RabbitConnection,
} from '@priceflux/mq';
import {
  ScrapeResultSchema,
  dedupeKeyForUrl,
} from '@priceflux/shared';

import type { PriceAlert } from './alert.js';
import { startNotifierWorker, type NotifierWorker } from './worker.js';

const integrationEnabled = process.env.PRICEFLUX_NOTIFIER_INTEGRATION === '1';

describe(
  'notifier worker (integration)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_NOTIFIER_INTEGRATION=1 (Postgres + broker + topology)'
      : false,
  },
  () => {
    let publisher: RabbitConnection;
    let db: DatabaseHandle;
    let worker: NotifierWorker | undefined;

    before(async () => {
      await runMigrations();
      db = createDatabase();
      publisher = await connectRabbitMq();
      await assertTopology(publisher.channel);
    });

    after(async () => {
      if (worker) {
        await worker.stop();
      }
      await publisher.close();
      await db.close();
    });

    it('consumes results.ready, writes history, and alerts', async () => {
      const email = `worker-${randomUUID()}@example.com`;
      const [user] = await db.db.insert(users).values({ email }).returning();
      assert.ok(user);

      const url = `https://shop.example/notify/${randomUUID()}`;
      const [watch] = await db.db
        .insert(watches)
        .values({
          userId: user.id,
          url,
          canonicalUrl: url,
          dedupeKey: dedupeKeyForUrl(url),
          threshold: '30.00',
          currency: 'USD',
        })
        .returning();
      assert.ok(watch);

      const result = ScrapeResultSchema.parse({
        jobId: randomUUID(),
        url,
        canonicalUrl: url,
        userId: user.id,
        watchId: watch.id,
        price: 22.5,
        currency: 'USD',
        title: 'Test Product',
        scrapedAt: new Date().toISOString(),
        source: 'json_ld',
      });

      let resolveAlert!: (a: PriceAlert) => void;
      let rejectAlert!: (err: Error) => void;
      const alerted = new Promise<PriceAlert>((resolve, reject) => {
        resolveAlert = resolve;
        rejectAlert = reject;
      });
      const timer = setTimeout(
        () => rejectAlert(new Error('timed out waiting for alert')),
        15_000,
      );

      worker = await startNotifierWorker({
        config: { prefetch: 1, logLevel: 'silent' },
        db,
        log: {
          info: () => undefined,
          error: () => undefined,
          warn: () => undefined,
        },
        onAlert: async (alert) => {
          clearTimeout(timer);
          resolveAlert(alert);
        },
      });

      await publishScrapeResult(publisher.channel, result);

      const alert = await alerted;
      assert.equal(alert.jobId, result.jobId);
      assert.equal(alert.price, 22.5);
      assert.equal(alert.threshold, 30);

      const rows = await db.db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.jobId, result.jobId));
      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0]?.price), 22.5);

      await db.db.delete(users).where(eq(users.id, user.id));
    });
  },
);
