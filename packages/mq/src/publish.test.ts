import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  DEFAULT_MAX_ATTEMPTS,
  Queues,
  ScrapeJobSchema,
  dedupeKeyForUrl,
} from '@priceflux/shared';

import { loadRabbitMqConfig } from './config.js';
import { connectRabbitMq } from './connection.js';
import { assertTopology, publishScrapeJob } from './publish.js';

const integrationEnabled = process.env.PRICEFLUX_MQ_INTEGRATION === '1';

describe('loadRabbitMqConfig', () => {
  it('prefers RABBITMQ_URL', () => {
    const cfg = loadRabbitMqConfig({
      RABBITMQ_URL: 'amqp://u:p@localhost:5672/v',
      RABBITMQ_USER: 'ignored',
    });
    assert.equal(cfg.url, 'amqp://u:p@localhost:5672/v');
  });

  it('builds a URL from discrete env vars', () => {
    const cfg = loadRabbitMqConfig({
      RABBITMQ_USER: 'priceflux',
      RABBITMQ_PASSWORD: 'secret',
      RABBITMQ_HOST: '127.0.0.1',
      RABBITMQ_PORT: '5672',
      RABBITMQ_VHOST: 'priceflux',
    });
    assert.equal(
      cfg.url,
      'amqp://priceflux:secret@127.0.0.1:5672/priceflux',
    );
  });
});

describe(
  'publishScrapeJob (integration)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_MQ_INTEGRATION=1 (broker must be up; run pnpm topology:assert first)'
      : false,
  },
  () => {
    it('publishes with confirms and lands on scrape.jobs', async () => {
      const url = 'https://shop.example/item/mq-test';
      const job = ScrapeJobSchema.parse({
        jobId: randomUUID(),
        url,
        canonicalUrl: url,
        dedupeKey: dedupeKeyForUrl(url),
        userId: 'test-user',
        requestedAt: new Date().toISOString(),
      });

      const rabbit = await connectRabbitMq();
      try {
        await assertTopology(rabbit.channel);
        await publishScrapeJob(rabbit.channel, {
          job,
          headers: {
            'x-attempt': 1,
            'x-max-attempts': DEFAULT_MAX_ATTEMPTS,
            'x-dedupe-key': job.dedupeKey,
          },
        });

        const message = await rabbit.channel.get(Queues.scrapeJobs, {
          noAck: false,
        });
        assert.ok(message, 'expected a message on scrape.jobs');
        const body = JSON.parse(message.content.toString('utf8')) as {
          jobId: string;
        };
        assert.equal(body.jobId, job.jobId);
        rabbit.channel.ack(message);
      } finally {
        await rabbit.close();
      }
    });
  },
);
