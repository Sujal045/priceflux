import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ScrapeJobHeadersSchema,
  ScrapeJobSchema,
  ScrapeResultSchema,
} from './schemas.js';
import { DEFAULT_MAX_ATTEMPTS, retryRoutingKeyForAttempt, RoutingKeys } from './topology.js';

const jobId = '11111111-1111-4111-8111-111111111111';
const dedupeKey = 'a'.repeat(64);

describe('ScrapeJobSchema', () => {
  it('accepts a valid job', () => {
    const job = ScrapeJobSchema.parse({
      jobId,
      url: 'https://shop.example/p/1',
      canonicalUrl: 'https://shop.example/p/1',
      dedupeKey,
      userId: 'user-1',
      requestedAt: '2026-09-21T10:00:00.000Z',
      threshold: 19.99,
    });
    assert.equal(job.userId, 'user-1');
    assert.equal(job.threshold, 19.99);
  });

  it('rejects bad dedupe keys', () => {
    assert.throws(() =>
      ScrapeJobSchema.parse({
        jobId,
        url: 'https://shop.example/p/1',
        canonicalUrl: 'https://shop.example/p/1',
        dedupeKey: 'short',
        userId: 'user-1',
        requestedAt: '2026-09-21T10:00:00.000Z',
      }),
    );
  });
});

describe('ScrapeResultSchema', () => {
  it('accepts a valid result', () => {
    const result = ScrapeResultSchema.parse({
      jobId,
      url: 'https://shop.example/p/1',
      canonicalUrl: 'https://shop.example/p/1',
      userId: 'user-1',
      price: 12.5,
      currency: 'USD',
      scrapedAt: '2026-09-21T10:05:00.000Z',
      source: 'json_ld',
    });
    assert.equal(result.source, 'json_ld');
  });
});

describe('ScrapeJobHeadersSchema', () => {
  it('coerces attempt counters from strings', () => {
    const headers = ScrapeJobHeadersSchema.parse({
      'x-attempt': '2',
      'x-dedupe-key': dedupeKey,
    });
    assert.equal(headers['x-attempt'], 2);
    assert.equal(headers['x-max-attempts'], DEFAULT_MAX_ATTEMPTS);
  });
});

describe('retryRoutingKeyForAttempt', () => {
  it('follows backoff tiers then dead', () => {
    assert.equal(retryRoutingKeyForAttempt(2), RoutingKeys.scrapeRetry30s);
    assert.equal(retryRoutingKeyForAttempt(3), RoutingKeys.scrapeRetry5m);
    assert.equal(retryRoutingKeyForAttempt(4), RoutingKeys.scrapeRetry30m);
    assert.equal(retryRoutingKeyForAttempt(5), RoutingKeys.scrapeDead);
  });
});
