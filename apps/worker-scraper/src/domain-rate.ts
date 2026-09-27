import {
  tryAcquireDomainSlot,
  type PricefluxRedis,
} from '@priceflux/cache';

import { ScrapeFailure } from './scrape.js';

/** Hostname used for per-domain Redis rate limiting. */
export function domainFromUrl(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

/**
 * Acquire a Redis domain slot when limiting is enabled (`limit > 0`).
 * Throws `ScrapeFailure` with reason `rate_limited` when the window is full.
 */
export async function assertDomainRateAllow(
  redis: PricefluxRedis,
  url: string,
  options: { limit: number; windowSeconds: number },
): Promise<void> {
  if (options.limit <= 0) {
    return;
  }

  const domain = domainFromUrl(url);
  const result = await tryAcquireDomainSlot(redis, domain, {
    limit: options.limit,
    windowSeconds: options.windowSeconds,
  });

  if (!result.allowed) {
    throw new ScrapeFailure(
      'rate_limited',
      `Domain rate limit exceeded for ${domain} (${result.count}/${result.limit} per ${result.windowSeconds}s)`,
    );
  }
}
