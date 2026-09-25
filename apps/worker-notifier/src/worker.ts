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

export type ResultHandler = (
  result: ScrapeResult,
  raw: ConsumeMessage,
) => Promise<void>;

export type NotifierWorker = {
  rabbit: RabbitConnection;
  db: DatabaseHandle;
  stop: () => Promise<void>;
};

export type StartNotifierWorkerOptions = {
  config?: NotifierWorkerConfig;
  db?: DatabaseHandle;
  onResult?: ResultHandler;
  onAlert?: AlertEmitter;
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

  const rabbit = await connectRabbitMq();
  await assertTopology(rabbit.channel);
  await rabbit.channel.prefetch(config.prefetch);

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
        onAlert,
      });
      log.info(
        {
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
        try {
          const parsed: unknown = JSON.parse(msg.content.toString('utf8'));
          const result = ScrapeResultSchema.parse(parsed);
          await onResult(result, msg);
          rabbit.channel.ack(msg);
        } catch (err) {
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
    stop: async () => {
      try {
        await rabbit.channel.cancel(consumerTag);
      } finally {
        await rabbit.close();
        if (ownsDb) {
          await dbHandle.close();
        }
      }
    },
  };
}
