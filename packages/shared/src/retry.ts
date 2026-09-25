import {
  DEFAULT_MAX_ATTEMPTS,
  RoutingKeys,
  retryRoutingKeyForAttempt,
} from './topology.js';
import type { ErrorClass, ScrapeJobHeaders } from './schemas.js';

export type FailureDestination = 'retry' | 'dead';

export type ScrapeFailurePlan = {
  destination: FailureDestination;
  routingKey: string;
  headers: ScrapeJobHeaders;
};

export type PlanScrapeFailureInput = {
  headers: ScrapeJobHeaders;
  errorClass: ErrorClass;
  /** Override "now" for tests. */
  now?: Date;
};

/**
 * Decide where a failed scrape job should go next.
 * Publishes to `scrape.dlx` with this routing key, then ack the original.
 */
export function planScrapeFailureRoute(
  input: PlanScrapeFailureInput,
): ScrapeFailurePlan {
  const attempt = input.headers['x-attempt'];
  const maxAttempts =
    input.headers['x-max-attempts'] ?? DEFAULT_MAX_ATTEMPTS;
  const firstFailureAt =
    input.headers['x-first-failure-at'] ??
    (input.now ?? new Date()).toISOString();

  const baseHeaders: ScrapeJobHeaders = {
    ...input.headers,
    'x-max-attempts': maxAttempts,
    'x-error-class': input.errorClass,
    'x-first-failure-at': firstFailureAt,
  };

  if (attempt >= maxAttempts) {
    return {
      destination: 'dead',
      routingKey: RoutingKeys.scrapeDead,
      headers: baseHeaders,
    };
  }

  const nextAttempt = attempt + 1;
  let routingKey = retryRoutingKeyForAttempt(nextAttempt);

  // Hard blocks: skip short tiers and jump to the longest retry delay.
  if (
    (input.errorClass === 'captcha' || input.errorClass === 'http_403') &&
    routingKey !== RoutingKeys.scrapeDead
  ) {
    routingKey = RoutingKeys.scrapeRetry30m;
  }

  if (routingKey === RoutingKeys.scrapeDead) {
    return {
      destination: 'dead',
      routingKey: RoutingKeys.scrapeDead,
      headers: {
        ...baseHeaders,
        'x-attempt': nextAttempt,
      },
    };
  }

  return {
    destination: 'retry',
    routingKey,
    headers: {
      ...baseHeaders,
      'x-attempt': nextAttempt,
    },
  };
}
