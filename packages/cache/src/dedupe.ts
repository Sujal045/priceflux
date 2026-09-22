import type { PricefluxRedis } from './client.js';

/** Default scrape-URL dedupe window (5 minutes), matching the architecture plan. */
export const DEFAULT_DEDUPE_TTL_SECONDS = 300;

export const DEDUPE_KEY_PREFIX = 'priceflux:dedupe:url:';

export function dedupeRedisKey(dedupeKey: string): string {
  return `${DEDUPE_KEY_PREFIX}${dedupeKey}`;
}

export type ClaimDedupeResult =
  | { claimed: true; ttlSeconds: number }
  | { claimed: false; ttlSeconds: number };

/**
 * Atomically claim a scrape for `dedupeKey` (SHA-256 of canonical URL).
 * Uses `SET key value NX EX ttl`. Returns whether this caller won the window.
 */
export async function tryClaimUrlDedupe(
  client: PricefluxRedis,
  dedupeKey: string,
  ttlSeconds: number = DEFAULT_DEDUPE_TTL_SECONDS,
): Promise<ClaimDedupeResult> {
  if (!/^[a-f0-9]{64}$/.test(dedupeKey)) {
    throw new Error('dedupeKey must be a 64-char lowercase hex SHA-256');
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('ttlSeconds must be a positive integer');
  }

  const key = dedupeRedisKey(dedupeKey);
  const result = await client.set(key, '1', { NX: true, EX: ttlSeconds });

  if (result === 'OK') {
    return { claimed: true, ttlSeconds };
  }

  const remaining = await client.ttl(key);
  return {
    claimed: false,
    ttlSeconds: remaining > 0 ? remaining : ttlSeconds,
  };
}

/** Remaining TTL for a dedupe key; `-2` if missing, `-1` if no expiry (unexpected). */
export async function getUrlDedupeTtl(
  client: PricefluxRedis,
  dedupeKey: string,
): Promise<number> {
  return client.ttl(dedupeRedisKey(dedupeKey));
}
