import type { ConsumeMessage } from 'amqplib';

import {
  connectRedis,
  disconnectRedis,
  type PricefluxRedis,
} from '@priceflux/cache';
import {
  asQueueDepthReader,
  createServiceMetrics,
  resolveCorrelationId,
  startMetricsServer,
  startQueueLagPoller,
  type MetricsServer,
  type QueueLagPoller,
  type ServiceMetrics,
} from '@priceflux/observability';
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
import { assertDomainRateAllow } from './domain-rate.js';
import { readScrapeJobHeaders } from './headers.js';
import { scrapeJob } from './scrape.js';

const LAGGED_QUEUES = [
  Queues.scrapeJobs,
  Queues.scrapeRetry30s,
  Queues.scrapeRetry5m,
  Queues.scrapeRetry30m,
  Queues.scrapeDead,
  Queues.resultsNotify,
] as const;

export type JobHandler = (job: ScrapeJob, raw: ConsumeMessage) => Promise<void>;

export type ScraperWorker = {
  rabbit: RabbitConnection;
  metrics: ServiceMetrics;
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
  /** Inject Redis (tests). When omitted and domain rate limit > 0, connects. */
  redis?: PricefluxRedis;
  metrics?: ServiceMetrics;
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

function recordJob(
  metrics: ServiceMetrics,
  outcome: string,
  started: bigint,
): void {
  const labels = { worker: 'scraper', outcome };
  metrics.jobsTotal.inc(labels);
  metrics.jobDurationSeconds.observe(
    labels,
    Number(process.hrtime.bigint() - started) / 1e9,
  );
}

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
  const metrics = options.metrics ?? createServiceMetrics('worker-scraper');

  const rabbit = await connectRabbitMq();
  await assertTopology(rabbit.channel);
  await rabbit.channel.prefetch(config.prefetch);

  const ownsRedis = !options.redis && config.domainRateLimit > 0;
  const redis: PricefluxRedis | undefined =
    options.redis ?? (ownsRedis ? await connectRedis() : undefined);

  const lagPoller: QueueLagPoller = startQueueLagPoller(
    metrics,
    asQueueDepthReader(rabbit.channel),
    LAGGED_QUEUES,
  );

  let metricsServer: MetricsServer | undefined;
  if (config.metricsPort > 0) {
    metricsServer = await startMetricsServer(metrics, config.metricsPort);
    log.info(
      { port: metricsServer.port },
      'scraper metrics server listening',
    );
  }

  let ownedFetcher: PageFetcher | undefined;
  const resolveFetcher = async (): Promise<PageFetcher> => {
    if (options.fetcher) return options.fetcher;
    if (!ownedFetcher) {
      ownedFetcher = await createPlaywrightFetcher({
        headless: config.headless,
        navigationTimeoutMs: config.navigationTimeoutMs,
        stealth: config.stealth,
        ...(config.proxyUrl !== undefined
          ? { proxyUrl: config.proxyUrl }
          : {}),
      });
      log.info(
        {
          stealth: config.stealth,
          proxy: Boolean(config.proxyUrl),
          domainRateLimit: config.domainRateLimit,
        },
        'scraper browser ready',
      );
    }
    return ownedFetcher;
  };

  const onJob: JobHandler =
    options.onJob ??
    (async (job) => {
      if (redis && config.domainRateLimit > 0) {
        await assertDomainRateAllow(redis, job.canonicalUrl, {
          limit: config.domainRateLimit,
          windowSeconds: config.domainRateWindowSeconds,
        });
      }
      const fetcher = await resolveFetcher();
      const result = await scrapeJob(job, (url) => fetcher.fetchHtml(url));
      await publishScrapeResult(rabbit.channel, result);
      log.info(
        {
          correlationId: job.jobId,
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
        const started = process.hrtime.bigint();
        let job: ScrapeJob | undefined;
        try {
          const parsed: unknown = JSON.parse(msg.content.toString('utf8'));
          job = ScrapeJobSchema.parse(parsed);
          const correlationId = resolveCorrelationId(
            msg.properties.headers as Record<string, unknown> | undefined,
            job.jobId,
          );
          await onJob(job, msg);
          rabbit.channel.ack(msg);
          recordJob(metrics, 'success', started);
          log.info(
            {
              correlationId,
              jobId: job.jobId,
              watchId: job.watchId,
              url: job.canonicalUrl,
            },
            'scrape job acknowledged',
          );
        } catch (err) {
          if (!job) {
            recordJob(metrics, 'poison', started);
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
          const correlationId = resolveCorrelationId(
            msg.properties.headers as Record<string, unknown> | undefined,
            job.jobId,
          );

          try {
            await publishScrapeFailure(rabbit.channel, {
              job,
              routingKey: plan.routingKey,
              headers: plan.headers,
            });
            rabbit.channel.ack(msg);
            recordJob(
              metrics,
              plan.destination === 'dead' ? 'dead' : 'retry',
              started,
            );
            log.warn(
              {
                correlationId,
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
            recordJob(metrics, 'publish_error', started);
            log.error(
              {
                correlationId,
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
    {
      queue: Queues.scrapeJobs,
      prefetch: config.prefetch,
      consumerTag,
      stealth: config.stealth,
      proxy: Boolean(config.proxyUrl),
      domainRateLimit: config.domainRateLimit,
    },
    'scraper worker consuming',
  );

  return {
    rabbit,
    metrics,
    stop: async () => {
      try {
        await rabbit.channel.cancel(consumerTag);
      } finally {
        lagPoller.stop();
        if (metricsServer) {
          await metricsServer.close();
        }
        if (ownedFetcher) {
          await ownedFetcher.close();
          ownedFetcher = undefined;
        }
        if (ownsRedis && redis) {
          await disconnectRedis(redis);
        }
        await rabbit.close();
      }
    },
  };
}
