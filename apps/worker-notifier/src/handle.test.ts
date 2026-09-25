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
import { ScrapeResultSchema, dedupeKeyForUrl } from '@priceflux/shared';

import type { PriceAlert } from './alert.js';
import { handleScrapeResult } from './handle.js';

const integrationEnabled = process.env.PRICEFLUX_NOTIFIER_INTEGRATION === '1';

describe(
  'handleScrapeResult (db)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_NOTIFIER_INTEGRATION=1 (Postgres)'
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

    async function seedWatch(opts: {
      threshold?: string | null;
      currency?: string | null;
      active?: boolean;
    }) {
      const email = `notify-${randomUUID()}@example.com`;
      const [user] = await handle.db
        .insert(users)
        .values({ email })
        .returning();
      assert.ok(user);

      const url = `https://shop.example/p/${randomUUID()}`;
      const [watch] = await handle.db
        .insert(watches)
        .values({
          userId: user.id,
          url,
          canonicalUrl: url,
          dedupeKey: dedupeKeyForUrl(url),
          threshold: opts.threshold === undefined ? '20.00' : opts.threshold,
          currency: opts.currency === undefined ? 'USD' : opts.currency,
          active: opts.active ?? true,
        })
        .returning();
      assert.ok(watch);

      return { user, watch, url };
    }

    function resultFor(
      watchId: string,
      userId: string,
      url: string,
      price: number,
      jobId = randomUUID(),
    ) {
      return ScrapeResultSchema.parse({
        jobId,
        url,
        canonicalUrl: url,
        userId,
        watchId,
        price,
        currency: 'USD',
        title: 'Acme Widget',
        scrapedAt: new Date().toISOString(),
        source: 'json_ld',
      });
    }

    it('inserts history and alerts when price <= threshold', async () => {
      const { user, watch, url } = await seedWatch({});
      const alerts: PriceAlert[] = [];
      const result = resultFor(watch.id, user.id, url, 18.5);

      const outcome = await handleScrapeResult(handle.db, result, {
        onAlert: async (a) => {
          alerts.push(a);
        },
      });

      assert.equal(outcome.inserted, true);
      assert.equal(outcome.alerted, true);
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0]?.price, 18.5);
      assert.equal(alerts[0]?.threshold, 20);
      assert.equal(alerts[0]?.email, user.email);

      const rows = await handle.db
        .select()
        .from(priceHistory)
        .where(eq(priceHistory.jobId, result.jobId));
      assert.equal(rows.length, 1);

      await handle.db.delete(users).where(eq(users.id, user.id));
    });

    it('is idempotent on jobId and does not re-alert', async () => {
      const { user, watch, url } = await seedWatch({});
      let alertCount = 0;
      const result = resultFor(watch.id, user.id, url, 15);

      const first = await handleScrapeResult(handle.db, result, {
        onAlert: async () => {
          alertCount += 1;
        },
      });
      const second = await handleScrapeResult(handle.db, result, {
        onAlert: async () => {
          alertCount += 1;
        },
      });

      assert.equal(first.inserted, true);
      assert.equal(first.alerted, true);
      assert.equal(second.inserted, false);
      assert.equal(second.reason, 'duplicate_job');
      assert.equal(alertCount, 1);

      await handle.db.delete(users).where(eq(users.id, user.id));
    });

    it('records history without alerting when above threshold', async () => {
      const { user, watch, url } = await seedWatch({ threshold: '10.00' });
      let alertCount = 0;
      const result = resultFor(watch.id, user.id, url, 25);

      const outcome = await handleScrapeResult(handle.db, result, {
        onAlert: async () => {
          alertCount += 1;
        },
      });

      assert.equal(outcome.inserted, true);
      assert.equal(outcome.alerted, false);
      assert.equal(outcome.reason, 'above_threshold');
      assert.equal(alertCount, 0);

      await handle.db.delete(users).where(eq(users.id, user.id));
    });
  },
);
