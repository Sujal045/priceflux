import type { ConsumeMessage } from 'amqplib';

import {
  assertTopology,
  connectRabbitMq,
  publishScrapeResult,
  type RabbitConnection,
} from '@priceflux/mq';
import { Queues, ScrapeJobSchema, type ScrapeJob } from '@priceflux/shared';

import {
  createPlaywrightFetcher,
  type PageFetcher,
} from './browser.js';
import {
  loadScraperWorkerConfig,
  type ScraperWorkerConfig,
} from './config.js';
import { scrapeJob } from './scrape.js';

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
   * Default: Playwright fetch → JSON-LD extract → publish `results.ready`.
   */
  onJob?: JobHandler;
  /**
   * Inject a page fetcher (tests). When omitted, Chromium is launched once
   * for the worker lifetime unless `onJob` is fully overridden.
   */
  fetcher?: PageFetcher;
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

/**
 * Consume `scrape.jobs` with manual ack.
 * Invalid payloads and scrape failures are nack'd without requeue
 * (→ DLX / scrape.fail → scrape.dead). Retry tiers land in stage 13.
 */
export async function startScraperWorker(
  options: StartScraperWorkerOptions = {},
): Promise<ScraperWorker> {
  const config = options.config ?? loadScraperWorkerConfig();
  const log = options.log ?? defaultLog;

  const rabbit = await connectRabbitMq();
  await assertTopology(rabbit.channel);
  await rabbit.channel.prefetch(config.prefetch);

  let ownedFetcher: PageFetcher | undefined;
  const resolveFetcher = async (): Promise<PageFetcher> => {
    if (options.fetcher) return options.fetcher;
    if (!ownedFetcher) {
      ownedFetcher = await createPlaywrightFetcher({
        headless: config.headless,
        navigationTimeoutMs: config.navigationTimeoutMs,
      });
    }
    return ownedFetcher;
  };

  const onJob: JobHandler =
    options.onJob ??
    (async (job) => {
      const fetcher = await resolveFetcher();
      const result = await scrapeJob(job, (url) => fetcher.fetchHtml(url));
      await publishScrapeResult(rabbit.channel, result);
      log.info(
        {
          jobId: result.jobId,
          watchId: result.watchId,
          price: result.price,
          currency: result.currency,
          source: result.source,
        },
        'scrape result published',
      );
    });

  // Warm the browser when using the default handler so the first job is faster.
  if (!options.onJob) {
    await resolveFetcher();
  }

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
            'scrape job acknowledged',
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
        if (ownedFetcher) {
          await ownedFetcher.close();
          ownedFetcher = undefined;
        }
        await rabbit.close();
      }
    },
  };
}
