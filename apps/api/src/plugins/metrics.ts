import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import {
  asQueueDepthReader,
  CORRELATION_HEADERS,
  createServiceMetrics,
  metricsContentType,
  refreshQueueDepths,
  renderMetrics,
  startQueueLagPoller,
  type QueueLagPoller,
  type ServiceMetrics,
} from '@priceflux/observability';
import type { RabbitConnection } from '@priceflux/mq';
import { Queues } from '@priceflux/shared';

const LAGGED_QUEUES = [
  Queues.scrapeJobs,
  Queues.scrapeRetry30s,
  Queues.scrapeRetry5m,
  Queues.scrapeRetry30m,
  Queues.scrapeDead,
  Queues.resultsNotify,
] as const;

const requestStarts = new WeakMap<FastifyRequest, bigint>();

declare module 'fastify' {
  interface FastifyInstance {
    metrics: ServiceMetrics;
  }
}

function optionalRabbit(
  app: { rabbit?: RabbitConnection },
): RabbitConnection | undefined {
  return app.rabbit;
}

/**
 * Prometheus metrics + correlation response header for the API.
 * Queue depth gauges refresh when RabbitMQ infra is available.
 */
export const metricsPlugin: FastifyPluginAsync = fp(async (app) => {
  const metrics = createServiceMetrics('api');
  app.decorate('metrics', metrics);

  let lagPoller: QueueLagPoller | undefined;

  app.addHook('onRequest', async (request, reply) => {
    reply.header(CORRELATION_HEADERS.requestId, request.id);
    requestStarts.set(request, process.hrtime.bigint());
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = requestStarts.get(request);
    if (start === undefined) return;

    const route =
      (request.routeOptions?.url as string | undefined) ??
      request.url.split('?')[0] ??
      'unknown';
    if (route === '/metrics') return;

    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };
    const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
    metrics.httpRequestsTotal.inc(labels);
    metrics.httpRequestDurationSeconds.observe(labels, elapsedSec);
  });

  app.get('/metrics', async (_request, reply) => {
    const rabbit = optionalRabbit(app);
    if (rabbit) {
      await refreshQueueDepths(
        metrics,
        asQueueDepthReader(rabbit.channel),
        LAGGED_QUEUES,
      );
    }
    const body = await renderMetrics(metrics);
    return reply
      .header('content-type', metricsContentType(metrics))
      .send(body);
  });

  app.addHook('onReady', async () => {
    const rabbit = optionalRabbit(app);
    if (!rabbit) return;
    lagPoller = startQueueLagPoller(
      metrics,
      asQueueDepthReader(rabbit.channel),
      LAGGED_QUEUES,
      15_000,
    );
  });

  app.addHook('onClose', async () => {
    lagPoller?.stop();
  });
});
