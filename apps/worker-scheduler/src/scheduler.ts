import {
  connectRedis,
  disconnectRedis,
  type PricefluxRedis,
} from '@priceflux/cache';
import { createDatabase, type DatabaseHandle } from '@priceflux/db';
import {
  assertTopology,
  connectRabbitMq,
  type RabbitConnection,
} from '@priceflux/mq';
import {
  createServiceMetrics,
  startMetricsServer,
  type MetricsServer,
  type ServiceMetrics,
} from '@priceflux/observability';

import {
  loadSchedulerWorkerConfig,
  type SchedulerWorkerConfig,
} from './config.js';
import { runSchedulerTick } from './tick.js';

export type SchedulerWorker = {
  rabbit: RabbitConnection;
  db: DatabaseHandle;
  redis: PricefluxRedis;
  metrics: ServiceMetrics;
  stop: () => Promise<void>;
};

export type StartSchedulerWorkerOptions = {
  config?: SchedulerWorkerConfig;
  db?: DatabaseHandle;
  redis?: PricefluxRedis;
  metrics?: ServiceMetrics;
  log?: {
    info: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
  };
};

const defaultLog = {
  info: (obj: unknown, msg?: string) => console.log(msg ?? '', obj),
  error: (obj: unknown, msg?: string) => console.error(msg ?? '', obj),
};

/**
 * Periodically enqueue scrapes for active watches past their interval.
 */
export async function startSchedulerWorker(
  options: StartSchedulerWorkerOptions = {},
): Promise<SchedulerWorker> {
  const config = options.config ?? loadSchedulerWorkerConfig();
  const log = options.log ?? defaultLog;
  const ownsDb = !options.db;
  const ownsRedis = !options.redis;
  const dbHandle = options.db ?? createDatabase();
  const redis = options.redis ?? (await connectRedis());
  const metrics = options.metrics ?? createServiceMetrics('worker-scheduler');

  const rabbit = await connectRabbitMq();
  await assertTopology(rabbit.channel);

  let metricsServer: MetricsServer | undefined;
  if (config.metricsPort > 0) {
    metricsServer = await startMetricsServer(metrics, config.metricsPort);
    log.info(
      { port: metricsServer.port },
      'scheduler metrics server listening',
    );
  }

  let running = false;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped || running) {
      return;
    }
    running = true;
    const started = process.hrtime.bigint();
    try {
      const result = await runSchedulerTick({
        db: dbHandle.db,
        redis,
        rabbit,
        watchIntervalSeconds: config.watchIntervalSeconds,
      });

      if (result.enqueued > 0) {
        metrics.jobsTotal.inc(
          { worker: 'scheduler', outcome: 'enqueued' },
          result.enqueued,
        );
      }
      if (result.skippedDedupe > 0) {
        metrics.jobsTotal.inc(
          { worker: 'scheduler', outcome: 'skipped_dedupe' },
          result.skippedDedupe,
        );
      }
      if (result.errors > 0) {
        metrics.jobsTotal.inc(
          { worker: 'scheduler', outcome: 'enqueue_error' },
          result.errors,
        );
      }

      const tickOutcome = result.errors > 0 ? 'partial' : 'success';
      metrics.jobsTotal.inc({ worker: 'scheduler', outcome: tickOutcome });
      metrics.jobDurationSeconds.observe(
        { worker: 'scheduler', outcome: tickOutcome },
        Number(process.hrtime.bigint() - started) / 1e9,
      );

      log.info(result, 'scheduler tick finished');
    } catch (err) {
      metrics.jobsTotal.inc({ worker: 'scheduler', outcome: 'error' });
      metrics.jobDurationSeconds.observe(
        { worker: 'scheduler', outcome: 'error' },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
      log.error(
        { err: err instanceof Error ? err.message : err },
        'scheduler tick failed',
      );
    } finally {
      running = false;
    }
  };

  void tick();
  const interval = setInterval(() => {
    void tick();
  }, config.pollIntervalSeconds * 1000);
  interval.unref();

  log.info(
    {
      pollIntervalSeconds: config.pollIntervalSeconds,
      watchIntervalSeconds: config.watchIntervalSeconds,
    },
    'scheduler worker started',
  );

  return {
    rabbit,
    db: dbHandle,
    redis,
    metrics,
    stop: async () => {
      stopped = true;
      clearInterval(interval);
      try {
        if (metricsServer) {
          await metricsServer.close();
        }
        await rabbit.close();
        if (ownsRedis) {
          await disconnectRedis(redis);
        }
        if (ownsDb) {
          await dbHandle.close();
        }
      } finally {
        // no-op
      }
    },
  };
}
