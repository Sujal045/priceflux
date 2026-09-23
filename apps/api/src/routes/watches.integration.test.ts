import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { Queues } from '@priceflux/shared';

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
  },
);
