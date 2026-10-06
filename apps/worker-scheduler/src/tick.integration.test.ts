import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { eq } from 'drizzle-orm';

import {
  connectRedis,
  disconnectRedis,
  type PricefluxRedis,
} from '@priceflux/cache';
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
  type RabbitConnection,
} from '@priceflux/mq';
import { Queues, dedupeKeyForUrl } from '@priceflux/shared';

import { runSchedulerTick } from './tick.js';

const integrationEnabled = process.env.PRICEFLUX_SCHEDULER_INTEGRATION === '1';

describe(
  'runSchedulerTick (integration)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_SCHEDULER_INTEGRATION=1 (Postgres + Redis + broker)'
      : false,
  },
  () => {
    let db: DatabaseHandle;
    let redis: PricefluxRedis;
    let rabbit: RabbitConnection;

    before(async () => {
      await runMigrations();
      db = createDatabase();
      redis = await connectRedis();
      rabbit = await connectRabbitMq();
      await assertTopology(rabbit.channel);
    });

    after(async () => {
      await rabbit.close();
      await disconnectRedis(redis);
      await db.close();
    });

    it('enqueues a due watch and skips a recently scraped watch', async () => {
      const email = `scheduler-${randomUUID()}@example.com`;
      const [user] = await db.db.insert(users).values({ email }).returning();
      assert.ok(user);

      const dueUrl = `https://shop.example/scheduler-due/${randomUUID()}`;
      const [dueWatch] = await db.db
        .insert(watches)
        .values({
          userId: user.id,
          url: dueUrl,
          canonicalUrl: dueUrl,
          dedupeKey: dedupeKeyForUrl(dueUrl),
          threshold: '25.00',
          currency: 'USD',
          active: true,
          createdAt: new Date(Date.now() - 7200_000),
        })
        .returning();
      assert.ok(dueWatch);

      const freshUrl = `https://shop.example/scheduler-fresh/${randomUUID()}`;
      const [freshWatch] = await db.db
        .insert(watches)
        .values({
          userId: user.id,
          url: freshUrl,
          canonicalUrl: freshUrl,
          dedupeKey: dedupeKeyForUrl(freshUrl),
          threshold: '25.00',
          currency: 'USD',
          active: true,
        })
        .returning();
      assert.ok(freshWatch);

      await db.db.insert(priceHistory).values({
        watchId: freshWatch.id,
        jobId: randomUUID(),
        price: '19.99',
        currency: 'USD',
        source: 'json_ld',
        scrapedAt: new Date(),
      });

      const beforeDepth = await rabbit.channel.checkQueue(Queues.scrapeJobs);

      const result = await runSchedulerTick({
        db: db.db,
        redis,
        rabbit,
        watchIntervalSeconds: 3600,
        now: new Date(),
      });

      assert.ok(result.dueWatches >= 1);
      assert.ok(result.enqueued >= 1);

      const afterDepth = await rabbit.channel.checkQueue(Queues.scrapeJobs);
      assert.ok(afterDepth.messageCount > beforeDepth.messageCount);

      await db.db.delete(users).where(eq(users.id, user.id));
    });
  },
);
