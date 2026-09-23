import { randomUUID } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';

import { loadApiConfig, type ApiConfig } from './config.js';
import { infraPlugin } from './plugins/infra.js';
import { healthRoutes } from './routes/health.js';
import { watchesRoutes } from './routes/watches.js';

export type BuildAppOptions = {
  config?: ApiConfig;
  /** Disable logging in tests. */
  logger?: boolean | { level: ApiConfig['logLevel'] };
  /**
   * Connect Postgres/Redis/RabbitMQ and register watches routes.
   * Default `true`. Set `false` for health-only unit tests.
   */
  withInfra?: boolean;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadApiConfig();
  const logger =
    options.logger === undefined
      ? { level: config.logLevel }
      : options.logger;
  const withInfra = options.withInfra ?? true;

  const app = Fastify({
    logger,
    requestIdHeader: 'x-request-id',
    genReqId: (req) => {
      const existing = req.headers['x-request-id'];
      if (typeof existing === 'string' && existing.length > 0) {
        return existing;
      }
      return randomUUID();
    },
  });

  app.decorate('config', config);
  await app.register(healthRoutes);

  if (withInfra) {
    await app.register(infraPlugin);
    await app.register(watchesRoutes);
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ApiConfig;
  }
}
