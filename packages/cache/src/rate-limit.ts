import type { PricefluxRedis } from './client.js';

export const DOMAIN_RATE_KEY_PREFIX = 'priceflux:rate:domain:';

export type DomainRateLimitOptions = {
  /** Max requests allowed in the window. */
  limit: number;
  /** Fixed window length in seconds. */
  windowSeconds: number;
};

export type DomainRateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  windowSeconds: number;
};

function domainRateKey(domain: string, windowSeconds: number): string {
  const normalized = domain.trim().toLowerCase();
  // Bucket by wall-clock window so keys expire naturally.
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  return `${DOMAIN_RATE_KEY_PREFIX}${normalized}:${windowSeconds}:${bucket}`;
}

/**
 * Fixed-window per-domain limiter (stub for later scraper concurrency control).
 * Increments a counter; first hit sets expiry to `windowSeconds`.
 */
export async function tryAcquireDomainSlot(
  client: PricefluxRedis,
  domain: string,
  options: DomainRateLimitOptions,
): Promise<DomainRateLimitResult> {
  const { limit, windowSeconds } = options;
  if (!domain.trim()) {
    throw new Error('domain is required');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('limit must be a positive integer');
  }
  if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
    throw new Error('windowSeconds must be a positive integer');
  }

  const key = domainRateKey(domain, windowSeconds);
  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, windowSeconds);
  }

  return {
    allowed: count <= limit,
    count,
    limit,
    windowSeconds,
  };
}
