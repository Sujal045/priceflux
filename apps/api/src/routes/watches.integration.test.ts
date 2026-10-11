import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { priceHistory, users, watches } from '@priceflux/db';
import { Queues, canonicalizeUrl, dedupeKeyForUrl } from '@priceflux/shared';

import { buildApp } from '../app.js';
import { loadApiConfig } from '../config.js';

const integrationEnabled = process.env.PRICEFLUX_API_INTEGRATION === '1';

describe(
  'watches API (integration)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_API_INTEGRATION=1 (Compose + migrate + topology)'
      : false,
  },
  () => {
    let app: FastifyInstance;

    before(async () => {
      app = await buildApp({
        config: loadApiConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
        logger: false,
        withInfra: true,
      });
      await app.ready();
    });

    after(async () => {
      await app.close();
    });

    it('creates a watch, queues a scrape once, then dedupes', async () => {
      const email = `api-${randomUUID()}@example.com`;
      const url = `https://shop.example/item/${randomUUID()}?utm_source=test`;

      const first = await app.inject({
        method: 'POST',
        url: '/watches',
        payload: { email, url, threshold: 25, currency: 'USD' },
      });
      assert.equal(first.statusCode, 201);
      const firstBody = first.json() as {
        scrapeQueued: boolean;
        jobId?: string;
        watch: { id: string; canonicalUrl: string };
      };
      assert.equal(firstBody.scrapeQueued, true);
      assert.ok(firstBody.jobId);

      const msg = await app.rabbit.channel.get(Queues.scrapeJobs, { noAck: false });
      assert.ok(msg, 'expected message on scrape.jobs');
      const payload = JSON.parse(msg.content.toString('utf8')) as { jobId: string };
      assert.equal(payload.jobId, firstBody.jobId);
      app.rabbit.channel.ack(msg);

      const second = await app.inject({
        method: 'POST',
        url: '/watches',
        payload: { email, url, threshold: 20 },
      });
      assert.equal(second.statusCode, 200);
      const secondBody = second.json() as {
        scrapeQueued: boolean;
        dedupeTtlSeconds?: number;
        watch: { id: string };
      };
      assert.equal(secondBody.scrapeQueued, false);
      assert.equal(secondBody.watch.id, firstBody.watch.id);
      assert.ok((secondBody.dedupeTtlSeconds ?? 0) > 0);

      const listed = await app.inject({
        method: 'GET',
        url: `/watches?email=${encodeURIComponent(email)}`,
      });
      assert.equal(listed.statusCode, 200);
      const listBody = listed.json() as { items: unknown[] };
      assert.equal(listBody.items.length, 1);

      const deactivated = await app.inject({
        method: 'DELETE',
        url: `/watches/${firstBody.watch.id}`,
      });
      assert.equal(deactivated.statusCode, 200);
      assert.equal((deactivated.json() as { watch: { active: boolean } }).watch.active, false);
    });

    it('serves price history and surfaces latest price on the watch', async () => {
      const email = `hist-${randomUUID()}@example.com`;
      const url = `https://shop.example/item/${randomUUID()}`;

      const created = await app.inject({
        method: 'POST',
        url: '/watches',
        payload: { email, url, threshold: 30, currency: 'USD' },
      });
      assert.equal(created.statusCode, 201);
      const watchId = (created.json() as { watch: { id: string } }).watch.id;

      // Drain the enqueued scrape job so the shared queue stays clean.
      const queued = await app.rabbit.channel.get(Queues.scrapeJobs, {
        noAck: false,
      });
      if (queued) {
        app.rabbit.channel.ack(queued);
      }

      // Simulate a notifier write.
      await app.db.insert(priceHistory).values({
        watchId,
        jobId: randomUUID(),
        price: '27.50',
        currency: 'USD',
        title: 'Example product',
        source: 'json_ld',
        scrapedAt: new Date(),
      });

      const history = await app.inject({
        method: 'GET',
        url: `/watches/${watchId}/history?limit=10`,
      });
      assert.equal(history.statusCode, 200);
      const historyBody = history.json() as {
        items: Array<{ price: number; currency: string }>;
      };
      assert.equal(historyBody.items.length, 1);
      assert.equal(historyBody.items[0]?.price, 27.5);
      assert.equal(historyBody.items[0]?.currency, 'USD');

      const listed = await app.inject({
        method: 'GET',
        url: `/watches?email=${encodeURIComponent(email)}`,
      });
      const listBody = listed.json() as {
        items: Array<{
          id: string;
          latestPrice: number | null;
          lastCheckedAt: string | null;
        }>;
      };
      const target = listBody.items.find((w) => w.id === watchId);
      assert.ok(target, 'expected the created watch in the list');
      assert.equal(target.latestPrice, 27.5);
      assert.ok(target.lastCheckedAt);

      const missing = await app.inject({
        method: 'GET',
        url: `/watches/${randomUUID()}/history`,
      });
      assert.equal(missing.statusCode, 404);
    });

    it('rechecks an existing watch via POST /watches/:id/check', async () => {
      const email = `recheck-${randomUUID()}@example.com`;
      const url = `https://shop.example/item/${randomUUID()}`;
      const canonicalUrl = canonicalizeUrl(url);
      const dedupeKey = dedupeKeyForUrl(url);

      // Insert the watch directly so no dedupe claim exists yet.
      const [user] = await app.db.insert(users).values({ email }).returning();
      assert.ok(user);
      const [watch] = await app.db
        .insert(watches)
        .values({
          userId: user.id,
          url,
          canonicalUrl,
          dedupeKey,
          site: new URL(canonicalUrl).hostname,
          active: true,
        })
        .returning();
      assert.ok(watch);

      const first = await app.inject({
        method: 'POST',
        url: `/watches/${watch.id}/check`,
      });
      assert.equal(first.statusCode, 202);
      const firstBody = first.json() as {
        scrapeQueued: boolean;
        jobId?: string;
      };
      assert.equal(firstBody.scrapeQueued, true);
      assert.ok(firstBody.jobId);

      const msg = await app.rabbit.channel.get(Queues.scrapeJobs, {
        noAck: false,
      });
      assert.ok(msg, 'expected a scrape job from recheck');
      const payload = JSON.parse(msg.content.toString('utf8')) as {
        jobId: string;
      };
      assert.equal(payload.jobId, firstBody.jobId);
      app.rabbit.channel.ack(msg);

      // Second recheck within the dedupe window is a no-op (200).
      const second = await app.inject({
        method: 'POST',
        url: `/watches/${watch.id}/check`,
      });
      assert.equal(second.statusCode, 200);
      const secondBody = second.json() as {
        scrapeQueued: boolean;
        dedupeTtlSeconds?: number;
      };
      assert.equal(secondBody.scrapeQueued, false);
      assert.ok((secondBody.dedupeTtlSeconds ?? 0) > 0);

      const unknown = await app.inject({
        method: 'POST',
        url: `/watches/${randomUUID()}/check`,
      });
      assert.equal(unknown.statusCode, 404);
    });
  },
);
