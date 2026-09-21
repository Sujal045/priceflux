/** Routing keys / queue names aligned with infra/rabbitmq/definitions.json */
export const Exchanges = {
  scrapeWork: 'scrape.work',
  scrapeDlx: 'scrape.dlx',
  resultsTopic: 'results.topic',
} as const;

export const Queues = {
  scrapeJobs: 'scrape.jobs',
  scrapeRetry30s: 'scrape.retry.30s',
  scrapeRetry5m: 'scrape.retry.5m',
  scrapeRetry30m: 'scrape.retry.30m',
  scrapeDead: 'scrape.dead',
  resultsNotify: 'results.notify',
} as const;

export const RoutingKeys = {
  scrapeJob: 'scrape.job',
  scrapeRetry30s: 'scrape.retry.30s',
  scrapeRetry5m: 'scrape.retry.5m',
  scrapeRetry30m: 'scrape.retry.30m',
  scrapeDead: 'scrape.dead',
  scrapeFail: 'scrape.fail',
  resultsReady: 'results.ready',
} as const;

export const DEFAULT_MAX_ATTEMPTS = 5;

/** Map attempt number (after failure) → DLX routing key for the next backoff tier. */
export function retryRoutingKeyForAttempt(nextAttempt: number): string {
  if (nextAttempt <= 2) return RoutingKeys.scrapeRetry30s;
  if (nextAttempt === 3) return RoutingKeys.scrapeRetry5m;
  if (nextAttempt === 4) return RoutingKeys.scrapeRetry30m;
  return RoutingKeys.scrapeDead;
}
