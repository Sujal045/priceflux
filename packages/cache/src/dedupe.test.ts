import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { connectRedis, disconnectRedis, type PricefluxRedis } from './client.js';
import { getUrlDedupeTtl, tryClaimUrlDedupe } from './dedupe.js';
import { tryAcquireDomainSlot } from './rate-limit.js';

const integrationEnabled = process.env.PRICEFLUX_CACHE_INTEGRATION === '1';

describe(
  'cache integration (Redis)',
  {
    skip: !integrationEnabled
      ? 'set PRICEFLUX_CACHE_INTEGRATION=1 (Redis must be up)'
      : false,
  },
  () => {
    let client: PricefluxRedis;

    before(async () => {
      client = await connectRedis();
    });

    after(async () => {
      await disconnectRedis(client);
    });

    it('claims a URL once within the TTL window', async () => {
      const dedupeKey = randomBytes(32).toString('hex');
      const first = await tryClaimUrlDedupe(client, dedupeKey, 30);
      assert.equal(first.claimed, true);

      const second = await tryClaimUrlDedupe(client, dedupeKey, 30);
      assert.equal(second.claimed, false);
      assert.ok(second.ttlSeconds > 0 && second.ttlSeconds <= 30);

      const ttl = await getUrlDedupeTtl(client, dedupeKey);
      assert.ok(ttl > 0 && ttl <= 30);
    });

    it('rejects invalid dedupe keys', async () => {
      await assert.rejects(
        () => tryClaimUrlDedupe(client, 'short'),
        /64-char lowercase hex/,
      );
    });

    it('enforces a fixed-window domain rate limit', async () => {
      const domain = `test-${randomBytes(4).toString('hex')}.example`;
      const opts = { limit: 2, windowSeconds: 60 };

      const a = await tryAcquireDomainSlot(client, domain, opts);
      const b = await tryAcquireDomainSlot(client, domain, opts);
      const c = await tryAcquireDomainSlot(client, domain, opts);

      assert.equal(a.allowed, true);
      assert.equal(b.allowed, true);
      assert.equal(c.allowed, false);
      assert.equal(c.count, 3);
    });
  },
);
