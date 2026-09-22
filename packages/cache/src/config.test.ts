import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadRedisConfig } from './config.js';
import { dedupeRedisKey, DEFAULT_DEDUPE_TTL_SECONDS } from './dedupe.js';

describe('loadRedisConfig', () => {
  it('prefers REDIS_URL', () => {
    const cfg = loadRedisConfig({
      REDIS_URL: 'redis://example:6379',
      REDIS_HOST: 'ignored',
    });
    assert.equal(cfg.url, 'redis://example:6379');
  });

  it('builds a URL from host/port', () => {
    const cfg = loadRedisConfig({
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6380',
    });
    assert.equal(cfg.url, 'redis://127.0.0.1:6380');
  });
});

describe('dedupeRedisKey', () => {
  it('prefixes the hash', () => {
    const hash = 'a'.repeat(64);
    assert.equal(dedupeRedisKey(hash), `priceflux:dedupe:url:${hash}`);
  });

  it('exports the default 5-minute TTL', () => {
    assert.equal(DEFAULT_DEDUPE_TTL_SECONDS, 300);
  });
});
