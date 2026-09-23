import { randomUUID } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';

import { loadApiConfig, type ApiConfig } from './config.js';
import { healthRoutes } from './routes/health.js';

export type BuildAppOptions = {
  config?: ApiConfig;
  /** Disable logging in tests. */
  logger?: boolean | { level: ApiConfig['logLevel'] };
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadApiConfig();
  const logger =
    options.logger === undefined
      ? { level: config.logLevel }
      : options.logger;

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

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: ApiConfig;
  }
}
