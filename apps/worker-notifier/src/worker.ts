import type { ConsumeMessage } from 'amqplib';

import {
  createDatabase,
  type DatabaseHandle,
} from '@priceflux/db';
import {
  assertTopology,
  connectRabbitMq,
  type RabbitConnection,
} from '@priceflux/mq';
import {
  asQueueDepthReader,
  createServiceMetrics,
  startMetricsServer,
  startQueueLagPoller,
  type MetricsServer,
  type QueueLagPoller,
  type ServiceMetrics,
} from '@priceflux/observability';
import {
  Queues,
  ScrapeResultSchema,
  type ScrapeResult,
} from '@priceflux/shared';

import {
  composeAlertEmitters,
  createLogAlertEmitter,
  createWebhookAlertEmitter,
  type AlertEmitter,
} from './alert.js';
import {
  loadNotifierWorkerConfig,
  type NotifierWorkerConfig,
} from './config.js';
import { handleScrapeResult } from './handle.js';

const LAGGED_QUEUES = [
  Queues.scrapeJobs,
  Queues.scrapeDead,
  Queues.resultsNotify,
] as const;

export type ResultHandler = (
  result: ScrapeResult,
  raw: ConsumeMessage,
) => Promise<void>;

export type NotifierWorker = {
  rabbit: RabbitConnection;
  db: DatabaseHandle;
  metrics: ServiceMetrics;
  stop: () => Promise<void>;
};

export type StartNotifierWorkerOptions = {
  config?: NotifierWorkerConfig;
  db?: DatabaseHandle;
  onResult?: ResultHandler;
  onAlert?: AlertEmitter;
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
  const labels = { worker: 'notifier', outcome };
  metrics.jobsTotal.inc(labels);
  metrics.jobDurationSeconds.observe(
    labels,
    Number(process.hrtime.bigint() - started) / 1e9,
  );
}

/**
 * Consume `results.notify` (bound to `results.ready`).
 * Writes `price_history` (idempotent on jobId) and emits drop alerts.
 * Poison payloads are nack'd without requeue.
 */
export async function startNotifierWorker(
  options: StartNotifierWorkerOptions = {},
): Promise<NotifierWorker> {
  const config = options.config ?? loadNotifierWorkerConfig();
  const log = options.log ?? defaultLog;
  const ownsDb = !options.db;
  const dbHandle = options.db ?? createDatabase();
  const metrics = options.metrics ?? createServiceMetrics('worker-notifier');

  const rabbit = await connectRabbitMq();
  await assertTopology(rabbit.channel);
  await rabbit.channel.prefetch(config.prefetch);

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
      'notifier metrics server listening',
    );
  }

  const onAlert =
    options.onAlert ??
    composeAlertEmitters([
      createLogAlertEmitter(log),
      ...(config.webhookUrl
        ? [createWebhookAlertEmitter(config.webhookUrl)]
        : []),
    ]);

  const onResult: ResultHandler =
    options.onResult ??
    (async (result) => {
      const outcome = await handleScrapeResult(dbHandle.db, result, {
        onAlert: async (alert) => {
          await onAlert(alert);
          metrics.alertsTotal.inc({ outcome: 'emitted' });
        },
      });
      log.info(
        {
          correlationId: result.jobId,
          jobId: result.jobId,
          watchId: result.watchId,
          price: result.price,
          currency: result.currency,
          ...outcome,
        },
        'scrape result handled',
      );
    });

  const { consumerTag } = await rabbit.channel.consume(
    Queues.resultsNotify,
    (msg) => {
      if (!msg) {
        return;
      }

      void (async () => {
        const started = process.hrtime.bigint();
        try {
          const parsed: unknown = JSON.parse(msg.content.toString('utf8'));
          const result = ScrapeResultSchema.parse(parsed);
          await onResult(result, msg);
          rabbit.channel.ack(msg);
          recordJob(metrics, 'success', started);
        } catch (err) {
          recordJob(metrics, 'error', started);
          log.error(
            {
              err: err instanceof Error ? err.message : err,
              content: msg.content.toString('utf8').slice(0, 500),
            },
            'scrape result failed; nack without requeue',
          );
          rabbit.channel.nack(msg, false, false);
        }
      })();
    },
    { noAck: false },
  );

  log.info(
    {
      queue: Queues.resultsNotify,
      prefetch: config.prefetch,
      consumerTag,
      webhook: Boolean(config.webhookUrl),
    },
    'notifier worker consuming',
  );

  return {
    rabbit,
    db: dbHandle,
    metrics,
    stop: async () => {
      try {
        await rabbit.channel.cancel(consumerTag);
      } finally {
        lagPoller.stop();
        if (metricsServer) {
          await metricsServer.close();
        }
        await rabbit.close();
        if (ownsDb) {
          await dbHandle.close();
        }
      }
    },
  };
}
