import { createClient, type RedisClientType } from 'redis';

import { loadRedisConfig, type RedisConfig } from './config.js';

export type PricefluxRedis = RedisClientType;

export async function connectRedis(
  config: RedisConfig = loadRedisConfig(),
): Promise<PricefluxRedis> {
  const client = createClient({ url: config.url });
  client.on('error', (err: Error) => {
    // Surface connection errors; callers still see failed commands.
    console.error('[priceflux/cache] redis error', err.message);
  });
  await client.connect();
  return client as PricefluxRedis;
}

export async function disconnectRedis(client: PricefluxRedis): Promise<void> {
  if (client.isOpen) {
    await client.quit();
  }
}
