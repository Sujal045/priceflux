import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planScrapeFailureRoute } from './retry.js';
import { RoutingKeys } from './topology.js';
import type { ScrapeJobHeaders } from './schemas.js';

const dedupeKey = 'a'.repeat(64);

function headers(
  partial: Partial<ScrapeJobHeaders> & Pick<ScrapeJobHeaders, 'x-attempt'>,
): ScrapeJobHeaders {
  return {
    'x-max-attempts': 5,
    'x-dedupe-key': dedupeKey,
    ...partial,
  };
}

describe('planScrapeFailureRoute', () => {
  it('routes attempt 1 → 2 onto scrape.retry.30s', () => {
    const plan = planScrapeFailureRoute({
      headers: headers({ 'x-attempt': 1 }),
      errorClass: 'timeout',
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    assert.equal(plan.destination, 'retry');
    assert.equal(plan.routingKey, RoutingKeys.scrapeRetry30s);
    assert.equal(plan.headers['x-attempt'], 2);
    assert.equal(plan.headers['x-error-class'], 'timeout');
    assert.equal(
      plan.headers['x-first-failure-at'],
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('routes attempt 2 → 3 onto scrape.retry.5m', () => {
    const plan = planScrapeFailureRoute({
      headers: headers({
        'x-attempt': 2,
        'x-first-failure-at': '2026-01-01T00:00:00.000Z',
      }),
      errorClass: 'http_429',
    });
    assert.equal(plan.routingKey, RoutingKeys.scrapeRetry5m);
    assert.equal(plan.headers['x-attempt'], 3);
    assert.equal(
      plan.headers['x-first-failure-at'],
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('routes attempt 3 → 4 onto scrape.retry.30m', () => {
    const plan = planScrapeFailureRoute({
      headers: headers({ 'x-attempt': 3 }),
      errorClass: 'parse',
    });
    assert.equal(plan.routingKey, RoutingKeys.scrapeRetry30m);
    assert.equal(plan.headers['x-attempt'], 4);
  });

  it('parks when next attempt would exhaust retries', () => {
    const plan = planScrapeFailureRoute({
      headers: headers({ 'x-attempt': 4 }),
      errorClass: 'unknown',
    });
    assert.equal(plan.destination, 'dead');
    assert.equal(plan.routingKey, RoutingKeys.scrapeDead);
    assert.equal(plan.headers['x-attempt'], 5);
  });

  it('parks immediately when already at max attempts', () => {
    const plan = planScrapeFailureRoute({
      headers: headers({ 'x-attempt': 5, 'x-max-attempts': 5 }),
      errorClass: 'parse',
    });
    assert.equal(plan.destination, 'dead');
    assert.equal(plan.headers['x-attempt'], 5);
  });

  it('jumps captcha/http_403 to the 30m tier', () => {
    const plan = planScrapeFailureRoute({
      headers: headers({ 'x-attempt': 1 }),
      errorClass: 'http_403',
    });
    assert.equal(plan.destination, 'retry');
    assert.equal(plan.routingKey, RoutingKeys.scrapeRetry30m);
    assert.equal(plan.headers['x-attempt'], 2);
  });
});
