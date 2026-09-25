import type { ConsumeMessage } from 'amqplib';

import {
  DEFAULT_MAX_ATTEMPTS,
  ScrapeJobHeadersSchema,
  type ScrapeJob,
  type ScrapeJobHeaders,
} from '@priceflux/shared';

/**
 * Read scrape job headers from the AMQP message, filling safe defaults
 * when producers omit fields (e.g. older publishers).
 */
export function readScrapeJobHeaders(
  msg: ConsumeMessage,
  job: ScrapeJob,
): ScrapeJobHeaders {
  const raw = msg.properties.headers ?? {};
  const parsed = ScrapeJobHeadersSchema.safeParse({
    'x-attempt': raw['x-attempt'] ?? 1,
    'x-max-attempts': raw['x-max-attempts'] ?? DEFAULT_MAX_ATTEMPTS,
    'x-first-failure-at': raw['x-first-failure-at'],
    'x-error-class': raw['x-error-class'],
    'x-dedupe-key': raw['x-dedupe-key'] ?? job.dedupeKey,
  });

  if (parsed.success) {
    return parsed.data;
  }

  return ScrapeJobHeadersSchema.parse({
    'x-attempt': 1,
    'x-max-attempts': DEFAULT_MAX_ATTEMPTS,
    'x-dedupe-key': job.dedupeKey,
  });
}
