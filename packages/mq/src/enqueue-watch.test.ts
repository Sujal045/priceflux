import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { WatchEnqueueInput } from './enqueue-watch.js';

describe('WatchEnqueueInput shape', () => {
  it('accepts a minimal watch payload for enqueue helpers', () => {
    const watch: WatchEnqueueInput = {
      watchId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      url: 'https://shop.example/p/1',
      canonicalUrl: 'https://shop.example/p/1',
      dedupeKey: 'a'.repeat(64),
      site: 'shop.example',
      threshold: 20,
      currency: 'USD',
    };
    assert.equal(watch.threshold, 20);
  });
});
