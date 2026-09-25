import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyScrapeError } from './classify.js';
import { ScrapeFailure } from './scrape.js';

describe('classifyScrapeError', () => {
  it('maps HTTP 403 / 429 scrape failures', () => {
    assert.equal(
      classifyScrapeError(new ScrapeFailure('http_403')),
      'http_403',
    );
    assert.equal(
      classifyScrapeError(new ScrapeFailure('http_429')),
      'http_429',
    );
  });

  it('maps extraction misses to parse', () => {
    assert.equal(
      classifyScrapeError(new ScrapeFailure('no_json_ld')),
      'parse',
    );
    assert.equal(
      classifyScrapeError(new ScrapeFailure('invalid_price')),
      'parse',
    );
  });

  it('maps timeout-like errors', () => {
    const err = new Error('page.goto: Timeout 30000ms exceeded');
    err.name = 'TimeoutError';
    assert.equal(classifyScrapeError(err), 'timeout');
  });

  it('defaults to unknown', () => {
    assert.equal(classifyScrapeError(new Error('boom')), 'unknown');
    assert.equal(classifyScrapeError('string'), 'unknown');
  });
});
