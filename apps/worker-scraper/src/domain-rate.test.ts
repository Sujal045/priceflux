import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertDomainRateAllow, domainFromUrl } from './domain-rate.js';
import { ScrapeFailure } from './scrape.js';

describe('domainFromUrl', () => {
  it('extracts lowercase hostname', () => {
    assert.equal(
      domainFromUrl('https://Shop.Example/p/1?x=1'),
      'shop.example',
    );
  });
});

describe('assertDomainRateAllow', () => {
  it('no-ops when limit is 0', async () => {
    await assertDomainRateAllow(
      {} as never,
      'https://shop.example/p/1',
      { limit: 0, windowSeconds: 60 },
    );
  });

  it('throws rate_limited when Redis denies the slot', async () => {
    const redis = {
      incr: async () => 3,
      expire: async () => true,
    };

    await assert.rejects(
      () =>
        assertDomainRateAllow(redis as never, 'https://shop.example/a', {
          limit: 2,
          windowSeconds: 60,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ScrapeFailure);
        assert.equal(err.reason, 'rate_limited');
        return true;
      },
    );
  });
});
