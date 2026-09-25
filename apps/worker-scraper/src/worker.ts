import type { ConsumeMessage } from 'amqplib';

import {
  assertTopology,
  connectRabbitMq,
  type RabbitConnection,
} from '@priceflux/mq';
import { Queues, ScrapeJobSchema, type ScrapeJob } from '@priceflux/shared';

import {
  loadScraperWorkerConfig,
  type ScraperWorkerConfig,
} from './config.js';

export type JobHandler = (job: ScrapeJob, raw: ConsumeMessage) => Promise<void>;

export type ScraperWorker = {
  rabbit: RabbitConnection;
  /** Resolves when the consumer is cancelled and the connection is closed. */
  stop: () => Promise<void>;
};

export type StartScraperWorkerOptions = {
  config?: ScraperWorkerConfig;
  /**
   * Called for each valid scrape job.
   * Skeleton default: log-only noop (real scraping lands in a later PR).
   */
  onJob?: JobHandler;
  log?: {
    info: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
};

const defaultLog = {
  info: (obj: unknown, msg?: string) => console.log(msg ?? '', obj),
  error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
  warn: (obj: unknown, msg?: string) => console.warn(msg ?? '', obj),
};

async function defaultOnJob(job: ScrapeJob): Promise<void> {
  // Intentionally no-op beyond acknowledgment — Playwright lands in PR 12.
  void job;
}

/**
 * Consume `scrape.jobs` with manual ack.
 * Invalid payloads are nack'd without requeue (→ DLX / scrape.fail → scrape.dead).
 */
export async function startScraperWorker(
  options: StartScraperWorkerOptions = {},
): Promise<ScraperWorker> {
  const config = options.config ?? loadScraperWorkerConfig();
  const log = options.log ?? defaultLog;
  const onJob = options.onJob ?? defaultOnJob;

  const rabbit = await connectRabbitMq();
  await assertTopology(rabbit.channel);
  await rabbit.channel.prefetch(config.prefetch);

  const { consumerTag } = await rabbit.channel.consume(
    Queues.scrapeJobs,
    (msg) => {
      if (!msg) {
        return;
      }

      void (async () => {
        try {
          const parsed: unknown = JSON.parse(msg.content.toString('utf8'));
          const job = ScrapeJobSchema.parse(parsed);
          await onJob(job, msg);
          rabbit.channel.ack(msg);
          log.info(
            { jobId: job.jobId, watchId: job.watchId, url: job.canonicalUrl },
            'scrape job acknowledged (skeleton)',
          );
        } catch (err) {
          log.error(
            {
              err: err instanceof Error ? err.message : err,
              content: msg.content.toString('utf8').slice(0, 500),
            },
            'scrape job failed; nack without requeue',
          );
          rabbit.channel.nack(msg, false, false);
        }
      })();
    },
    { noAck: false },
  );

  log.info(
    { queue: Queues.scrapeJobs, prefetch: config.prefetch, consumerTag },
    'scraper worker consuming',
  );

  return {
    rabbit,
    stop: async () => {
      try {
        await rabbit.channel.cancel(consumerTag);
      } finally {
        await rabbit.close();
      }
    },
  };
}
