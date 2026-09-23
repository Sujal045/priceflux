import fp from 'fastify-plugin';

import {
  connectRedis,
  disconnectRedis,
  type PricefluxRedis,
} from '@priceflux/cache';
import {
  createDatabase,
  type Database,
  type DatabaseHandle,
} from '@priceflux/db';
import {
  assertTopology,
  connectRabbitMq,
  type RabbitConnection,
} from '@priceflux/mq';

export type InfraHandles = {
  database: DatabaseHandle;
  redis: PricefluxRedis;
  rabbit: RabbitConnection;
};

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    redis: PricefluxRedis;
    rabbit: RabbitConnection;
  }
}

/**
 * Connects Postgres, Redis, and RabbitMQ and decorates the Fastify instance.
 * Skipped when `withInfra: false` (unit tests / health-only).
 */
export const infraPlugin = fp(async (app) => {
  const database = createDatabase();
  const redis = await connectRedis();
  const rabbit = await connectRabbitMq();
  await assertTopology(rabbit.channel);

  app.decorate('db', database.db);
  app.decorate('redis', redis);
  app.decorate('rabbit', rabbit);

  app.addHook('onClose', async () => {
    await rabbit.close();
    await disconnectRedis(redis);
    await database.close();
  });

  app.log.info('Infra connected (db, redis, rabbitmq)');
});
