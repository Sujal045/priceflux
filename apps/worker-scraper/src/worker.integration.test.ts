import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

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
  dedupeKeyForUrl,
} from '@priceflux/shared';

import { startScraperWorker, type ScraperWorker } from './worker.js';

const integrationEnabled = process.env.PRICEFLUX_WORKER_INTEGRATION === '1';

describe(
  'scraper worker (integration)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_WORKER_INTEGRATION=1 (broker + topology)'
      : false,
  },
  () => {
    let publisher: RabbitConnection;
    let worker: ScraperWorker | undefined;

    before(async () => {
      publisher = await connectRabbitMq();
      await assertTopology(publisher.channel);
    });

    after(async () => {
      if (worker) {
        await worker.stop();
      }
      await publisher.close();
    });

    it('consumes a scrape job and acks it', async () => {
      const url = `https://shop.example/worker/${randomUUID()}`;
      const job = ScrapeJobSchema.parse({
        jobId: randomUUID(),
        url,
        canonicalUrl: url,
        dedupeKey: dedupeKeyForUrl(url),
        userId: randomUUID(),
        watchId: randomUUID(),
        requestedAt: new Date().toISOString(),
      });

      let resolveHandled!: () => void;
      let rejectHandled!: (err: Error) => void;
      const handled = new Promise<void>((resolve, reject) => {
        resolveHandled = resolve;
        rejectHandled = reject;
      });
      const timer = setTimeout(
        () => rejectHandled(new Error('timed out waiting for worker')),
        10_000,
      );

      let handledJobId: string | undefined;
      worker = await startScraperWorker({
        config: { prefetch: 1, logLevel: 'silent' },
        log: {
          info: () => undefined,
          error: () => undefined,
          warn: () => undefined,
        },
        onJob: async (received) => {
          handledJobId = received.jobId;
          clearTimeout(timer);
          resolveHandled();
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

      await handled;
      assert.equal(handledJobId, job.jobId);

      const leftover = await publisher.channel.get(Queues.scrapeJobs, {
        noAck: true,
      });
      if (leftover) {
        const body = JSON.parse(leftover.content.toString('utf8')) as {
          jobId: string;
        };
        assert.notEqual(body.jobId, job.jobId);
      }
    });
  },
);
