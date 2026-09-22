import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { eq } from 'drizzle-orm';

import { createDatabase, type DatabaseHandle } from './client.js';
import { runMigrations } from './migrate.js';
import { priceHistory, users, watches } from './schema.js';

const integrationEnabled = process.env.PRICEFLUX_DB_INTEGRATION === '1';

describe(
  'db integration (Postgres)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_DB_INTEGRATION=1 (Postgres must be up)'
      : false,
  },
  () => {
    let handle: DatabaseHandle;

    before(async () => {
      await runMigrations();
      handle = createDatabase();
    });

    after(async () => {
      await handle.close();
    });

    it('migrates and supports user → watch → price_history', async () => {
      const email = `user-${randomUUID()}@example.com`;
      const [user] = await handle.db
        .insert(users)
        .values({ email })
        .returning();
      assert.ok(user);

      const [watch] = await handle.db
        .insert(watches)
        .values({
          userId: user.id,
          url: 'https://shop.example/p/1?utm_source=x',
          canonicalUrl: 'https://shop.example/p/1',
          dedupeKey: 'a'.repeat(64),
          threshold: '19.99',
          currency: 'USD',
        })
        .returning();
      assert.ok(watch);

      const jobId = randomUUID();
      const [row] = await handle.db
        .insert(priceHistory)
        .values({
          watchId: watch.id,
          jobId,
          price: '18.50',
          currency: 'USD',
          source: 'json_ld',
          scrapedAt: new Date(),
        })
        .returning();
      assert.ok(row);

      const found = await handle.db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.jobId, jobId));
      assert.equal(found.length, 1);

      // cleanup
      await handle.db.delete(users).where(eq(users.id, user.id));
    });

    it('enforces unique job_id on price_history', async () => {
      const email = `user-${randomUUID()}@example.com`;
      const [user] = await handle.db
        .insert(users)
        .values({ email })
        .returning();
      assert.ok(user);

      const [watch] = await handle.db
        .insert(watches)
        .values({
          userId: user.id,
          url: 'https://shop.example/p/2',
          canonicalUrl: 'https://shop.example/p/2',
          dedupeKey: 'b'.repeat(64),
        })
        .returning();
      assert.ok(watch);

      const jobId = randomUUID();
      await handle.db.insert(priceHistory).values({
        watchId: watch.id,
        jobId,
        price: '10.00',
        currency: 'USD',
        source: 'html',
        scrapedAt: new Date(),
      });

      await assert.rejects(
        () =>
          handle.db.insert(priceHistory).values({
            watchId: watch.id,
            jobId,
            price: '9.00',
            currency: 'USD',
            source: 'html',
            scrapedAt: new Date(),
          }),
      );

      await handle.db.delete(users).where(eq(users.id, user.id));
    });
  },
);
