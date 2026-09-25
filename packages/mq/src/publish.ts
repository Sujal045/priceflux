import type { ConfirmChannel, Options, Replies } from 'amqplib';

import {
  Exchanges,
  Queues,
  RoutingKeys,
} from '@priceflux/shared';

const REQUIRED_EXCHANGES = [
  Exchanges.scrapeWork,
  Exchanges.scrapeDlx,
  Exchanges.resultsTopic,
] as const;

const REQUIRED_QUEUES = [
  Queues.scrapeJobs,
  Queues.scrapeRetry30s,
  Queues.scrapeRetry5m,
  Queues.scrapeRetry30m,
  Queues.scrapeDead,
  Queues.resultsNotify,
] as const;

/**
 * Fail fast if expected topology is missing (does not create anything).
 * Run `pnpm topology:assert` (or apply definitions) before app boot in local/dev.
 */
export async function assertTopology(channel: ConfirmChannel): Promise<void> {
  for (const name of REQUIRED_EXCHANGES) {
    await channel.checkExchange(name);
  }
  for (const name of REQUIRED_QUEUES) {
    await channel.checkQueue(name);
  }
}

export type PublishJsonInput = {
  exchange: string;
  routingKey: string;
  payload: unknown;
  headers?: Options.Publish['headers'];
  persistent?: boolean;
  contentType?: string;
  correlationId?: string;
  messageId?: string;
};

/**
 * Publish JSON with publisher confirms. Resolves only after the broker acks.
 */
export function publishJson(
  channel: ConfirmChannel,
  input: PublishJsonInput,
): Promise<Replies.Empty> {
  const body = Buffer.from(JSON.stringify(input.payload), 'utf8');
  const options: Options.Publish = {
    contentType: input.contentType ?? 'application/json',
    contentEncoding: 'utf8',
    persistent: input.persistent ?? true,
    headers: input.headers,
    correlationId: input.correlationId,
    messageId: input.messageId,
    timestamp: Date.now(),
  };

  return new Promise((resolve, reject) => {
    channel.publish(
      input.exchange,
      input.routingKey,
      body,
      options,
      (err, ok) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(ok);
      },
    );
  });
}

export type PublishScrapeJobInput = {
  job: unknown;
  headers: Record<string, string | number | boolean | undefined>;
};

/** Publish a scrape job to scrape.work / scrape.job with confirms. */
export function publishScrapeJob(
  channel: ConfirmChannel,
  input: PublishScrapeJobInput,
): Promise<Replies.Empty> {
  const headers: Options.Publish['headers'] = {};
  for (const [key, value] of Object.entries(input.headers)) {
    if (value !== undefined) {
      headers[key] = value;
    }
  }

  const messageId = readJobId(input.job);
  return publishJson(channel, {
    exchange: Exchanges.scrapeWork,
    routingKey: RoutingKeys.scrapeJob,
    payload: input.job,
    headers,
    ...(messageId !== undefined ? { messageId } : {}),
  });
}

/** Publish a scrape result to results.topic / results.ready with confirms. */
export function publishScrapeResult(
  channel: ConfirmChannel,
  result: unknown,
): Promise<Replies.Empty> {
  const messageId = readJobId(result);
  return publishJson(channel, {
    exchange: Exchanges.resultsTopic,
    routingKey: RoutingKeys.resultsReady,
    payload: result,
    ...(messageId !== undefined ? { messageId } : {}),
  });
}

export type PublishScrapeFailureInput = {
  job: unknown;
  /** DLX routing key: scrape.retry.* or scrape.dead */
  routingKey: string;
  headers: Record<string, string | number | boolean | undefined>;
};

/**
 * Publish a failed scrape job to scrape.dlx (retry TTL queue or dead letter)
 * with publisher confirms.
 */
export function publishScrapeFailure(
  channel: ConfirmChannel,
  input: PublishScrapeFailureInput,
): Promise<Replies.Empty> {
  const headers: Options.Publish['headers'] = {};
  for (const [key, value] of Object.entries(input.headers)) {
    if (value !== undefined) {
      headers[key] = value;
    }
  }

  const messageId = readJobId(input.job);
  return publishJson(channel, {
    exchange: Exchanges.scrapeDlx,
    routingKey: input.routingKey,
    payload: input.job,
    headers,
    ...(messageId !== undefined ? { messageId } : {}),
  });
}

function readJobId(value: unknown): string | undefined {
  if (
    typeof value === 'object' &&
    value !== null &&
    'jobId' in value &&
    typeof (value as { jobId: unknown }).jobId === 'string'
  ) {
    return (value as { jobId: string }).jobId;
  }
  return undefined;
}
