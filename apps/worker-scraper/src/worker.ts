import type { ConsumeMessage } from 'amqplib';

import {
  assertTopology,
  connectRabbitMq,
  publishScrapeFailure,
  publishScrapeResult,
  type RabbitConnection,
} from '@priceflux/mq';
import {
  Queues,
  ScrapeJobSchema,
  planScrapeFailureRoute,
  type ScrapeJob,
} from '@priceflux/shared';

import {
  createPlaywrightFetcher,
  type PageFetcher,
} from './browser.js';
import { classifyScrapeError } from './classify.js';
import {
  loadScraperWorkerConfig,
  type ScraperWorkerConfig,
} from './config.js';
import { readScrapeJobHeaders } from './headers.js';
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
 *
 * Success: publish `results.ready`, then ack.
 * Scrape failure: publish to `scrape.dlx` (retry tier or dead) with confirms,
 * then ack. Poison payloads: nack without requeue → `scrape.fail` → dead.
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
        let job: ScrapeJob | undefined;
        try {
          const parsed: unknown = JSON.parse(msg.content.toString('utf8'));
          job = ScrapeJobSchema.parse(parsed);
          await onJob(job, msg);
          rabbit.channel.ack(msg);
          log.info(
            { jobId: job.jobId, watchId: job.watchId, url: job.canonicalUrl },
            'scrape job acknowledged',
          );
        } catch (err) {
          if (!job) {
            log.error(
              {
                err: err instanceof Error ? err.message : err,
                content: msg.content.toString('utf8').slice(0, 500),
              },
              'poison scrape job; nack without requeue',
            );
            rabbit.channel.nack(msg, false, false);
            return;
          }

          const errorClass = classifyScrapeError(err);
          const currentHeaders = readScrapeJobHeaders(msg, job);
          const plan = planScrapeFailureRoute({
            headers: currentHeaders,
            errorClass,
          });

          try {
            await publishScrapeFailure(rabbit.channel, {
              job,
              routingKey: plan.routingKey,
              headers: plan.headers,
            });
            rabbit.channel.ack(msg);
            log.warn(
              {
                jobId: job.jobId,
                errorClass,
                destination: plan.destination,
                routingKey: plan.routingKey,
                attempt: plan.headers['x-attempt'],
                maxAttempts: plan.headers['x-max-attempts'],
                err: err instanceof Error ? err.message : err,
              },
              plan.destination === 'dead'
                ? 'scrape job parked on dead letter'
                : 'scrape job scheduled for retry',
            );
          } catch (publishErr) {
            log.error(
              {
                jobId: job.jobId,
                err:
                  publishErr instanceof Error
                    ? publishErr.message
                    : publishErr,
              },
              'failed to publish scrape failure; nack without requeue',
            );
            rabbit.channel.nack(msg, false, false);
          }
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
