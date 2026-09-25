import type { ErrorClass } from '@priceflux/shared';

import { ScrapeFailure } from './scrape.js';

const PARSE_REASONS = new Set([
  'no_json_ld',
  'no_product',
  'no_price',
  'invalid_price',
]);

/**
 * Map a thrown error to a stable ErrorClass for retry headers / ops.
 */
export function classifyScrapeError(err: unknown): ErrorClass {
  if (err instanceof ScrapeFailure) {
    if (err.reason === 'http_403') return 'http_403';
    if (err.reason === 'http_429') return 'http_429';
    if (PARSE_REASONS.has(err.reason)) return 'parse';
    if (err.reason.startsWith('http_')) return 'unknown';
  }

  if (err instanceof Error) {
    const name = err.name;
    const message = err.message;
    if (
      name === 'TimeoutError' ||
      /timeout/i.test(name) ||
      /timeout/i.test(message)
    ) {
      return 'timeout';
    }
    if (/captcha|challenge/i.test(message)) {
      return 'captcha';
    }
    if (/proxy/i.test(message)) {
      return 'proxy';
    }
  }

  return 'unknown';
}
