import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertTopology,
  connectRabbitMq,
  publishScrapeJob,
  type RabbitConnection,
} from '@priceflux/mq';
import {
  DEFAULT_MAX_ATTEMPTS,
  Queues,
  ScrapeJobSchema,
  ScrapeResultSchema,
  dedupeKeyForUrl,
} from '@priceflux/shared';

import { createPlaywrightFetcher, type PageFetcher } from './browser.js';
import { startScraperWorker, type ScraperWorker } from './worker.js';

const integrationEnabled = process.env.PRICEFLUX_WORKER_INTEGRATION === '1';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/scrape-core/fixtures',
);

describe(
  'scraper worker (integration)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_WORKER_INTEGRATION=1 (broker + topology + Chromium)'
      : false,
  },
  () => {
    let publisher: RabbitConnection;
    let worker: ScraperWorker | undefined;
    let fetcher: PageFetcher | undefined;
    let fixtureServer: Server | undefined;
    let fixtureUrl: string | undefined;

    before(async () => {
      publisher = await connectRabbitMq();
      await assertTopology(publisher.channel);

      const html = await readFile(
        join(fixturesDir, 'product-simple.html'),
        'utf8',
      );
      fixtureServer = createServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      await new Promise<void>((resolve) => {
        fixtureServer!.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = fixtureServer.address();
      assert.ok(addr && typeof addr === 'object');
      fixtureUrl = `http://127.0.0.1:${addr.port}/product-simple`;

      fetcher = await createPlaywrightFetcher({
        headless: true,
        navigationTimeoutMs: 15_000,
      });
    });

    after(async () => {
      if (worker) {
        await worker.stop();
      }
      if (fetcher) {
        await fetcher.close();
      }
      if (fixtureServer) {
        await new Promise<void>((resolve, reject) => {
          fixtureServer!.close((err) => (err ? reject(err) : resolve()));
        });
      }
      await publisher.close();
    });

    it('scrapes a fixture URL and publishes results.ready', async () => {
      assert.ok(fixtureUrl);
      assert.ok(fetcher);

      const job = ScrapeJobSchema.parse({
        jobId: randomUUID(),
        url: fixtureUrl,
        canonicalUrl: fixtureUrl,
        dedupeKey: dedupeKeyForUrl(fixtureUrl),
        userId: randomUUID(),
        watchId: randomUUID(),
        requestedAt: new Date().toISOString(),
      });

      worker = await startScraperWorker({
        config: {
          prefetch: 1,
          logLevel: 'silent',
          headless: true,
          navigationTimeoutMs: 15_000,
        },
        fetcher,
        log: {
          info: () => undefined,
          error: () => undefined,
          warn: () => undefined,
        },
      });

      await publishScrapeJob(publisher.channel, {
        job,
        headers: {
          'x-attempt': 1,
          'x-max-attempts': DEFAULT_MAX_ATTEMPTS,
          'x-dedupe-key': job.dedupeKey,
        },
      });

      const deadline = Date.now() + 20_000;
      let resultMsg: Awaited<ReturnType<typeof publisher.channel.get>> =
        false;
      while (Date.now() < deadline) {
        resultMsg = await publisher.channel.get(Queues.resultsNotify, {
          noAck: false,
        });
        if (resultMsg) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      assert.ok(resultMsg, 'expected message on results.notify');
      const body = ScrapeResultSchema.parse(
        JSON.parse(resultMsg.content.toString('utf8')),
      );
      assert.equal(body.jobId, job.jobId);
      assert.equal(body.price, 29.99);
      assert.equal(body.currency, 'USD');
      assert.equal(body.title, 'Acme Widget');
      assert.equal(body.source, 'json_ld');
      publisher.channel.ack(resultMsg);

      const leftover = await publisher.channel.get(Queues.scrapeJobs, {
        noAck: true,
      });
      if (leftover) {
        const leftoverBody = JSON.parse(leftover.content.toString('utf8')) as {
          jobId: string;
        };
        assert.notEqual(leftoverBody.jobId, job.jobId);
      }
    });
  },
);
