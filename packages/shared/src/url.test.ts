import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalizeUrl, dedupeKeyForUrl } from './url.js';

describe('canonicalizeUrl', () => {
  it('lowercases host and strips hash', () => {
    assert.equal(
      canonicalizeUrl('HTTPS://Example.COM/Path#section'),
      'https://example.com/Path',
    );
  });

  it('removes tracking params and sorts the rest', () => {
    assert.equal(
      canonicalizeUrl('https://shop.example/p?b=2&utm_source=x&a=1&fbclid=zz'),
      'https://shop.example/p?a=1&b=2',
    );
  });

  it('strips trailing slash on paths', () => {
    assert.equal(canonicalizeUrl('https://shop.example/p/'), 'https://shop.example/p');
  });

  it('keeps origin root slash', () => {
    assert.equal(canonicalizeUrl('https://shop.example/'), 'https://shop.example/');
  });

  it('rejects non-http protocols', () => {
    assert.throws(() => canonicalizeUrl('ftp://example.com/a'), /Unsupported URL protocol/);
  });

  it('rejects invalid URLs', () => {
    assert.throws(() => canonicalizeUrl('not a url'), /Invalid URL/);
  });
});

describe('dedupeKeyForUrl', () => {
  it('is stable for equivalent URLs', () => {
    const a = dedupeKeyForUrl('https://SHOP.example/item?utm_campaign=1&id=9');
    const b = dedupeKeyForUrl('https://shop.example/item/?id=9');
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it('differs for different products', () => {
    const a = dedupeKeyForUrl('https://shop.example/item/1');
    const b = dedupeKeyForUrl('https://shop.example/item/2');
    assert.notEqual(a, b);
  });
});
