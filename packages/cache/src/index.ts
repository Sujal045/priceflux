export const PACKAGE_NAME = '@priceflux/cache' as const;

export { loadRedisConfig, type RedisConfig } from './config.js';
export {
  connectRedis,
  disconnectRedis,
  type PricefluxRedis,
} from './client.js';
export {
  DEFAULT_DEDUPE_TTL_SECONDS,
  DEDUPE_KEY_PREFIX,
  dedupeRedisKey,
  getUrlDedupeTtl,
  tryClaimUrlDedupe,
  type ClaimDedupeResult,
} from './dedupe.js';
export {
  DOMAIN_RATE_KEY_PREFIX,
  tryAcquireDomainSlot,
  type DomainRateLimitOptions,
  type DomainRateLimitResult,
} from './rate-limit.js';
