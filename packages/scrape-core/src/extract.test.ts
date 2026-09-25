import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  collectJsonLdDocuments,
  extractPriceFromHtml,
  flattenJsonLdNodes,
} from './index.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

describe('extractPriceFromHtml', () => {
  it('extracts Product + Offer from a simple JSON-LD block', () => {
    const result = extractPriceFromHtml(loadFixture('product-simple.html'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.data, {
      price: 29.99,
      currency: 'USD',
      title: 'Acme Widget',
      source: 'json_ld',
    });
  });

  it('uses AggregateOffer lowPrice when present', () => {
    const result = extractPriceFromHtml(loadFixture('product-aggregate.html'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.price, 12.5);
    assert.equal(result.data.currency, 'EUR');
    assert.equal(result.data.title, 'Bulk Cable');
    assert.equal(result.data.source, 'json_ld');
  });

  it('finds Product nodes inside @graph', () => {
    const result = extractPriceFromHtml(loadFixture('product-graph.html'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.price, 149);
    assert.equal(result.data.currency, 'GBP');
    assert.equal(result.data.title, 'Graph Headphones');
  });

  it('returns no_price when Product has no usable offer price', () => {
    const result = extractPriceFromHtml(loadFixture('product-missing-price.html'));
    assert.deepEqual(result, { ok: false, reason: 'no_price' });
  });

  it('returns no_json_ld when page has no ld+json scripts', () => {
    const result = extractPriceFromHtml(loadFixture('no-jsonld.html'));
    assert.deepEqual(result, { ok: false, reason: 'no_json_ld' });
  });

  it('returns no_price when offer price cannot be parsed as money', () => {
    // "not-a-number" is skipped as unusable; no other offer → no_price
    const result = extractPriceFromHtml(loadFixture('product-invalid-price.html'));
    assert.deepEqual(result, { ok: false, reason: 'no_price' });
  });

  it('returns no_product when JSON-LD has no Product type', () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>`;
    const result = extractPriceFromHtml(html);
    assert.deepEqual(result, { ok: false, reason: 'no_product' });
  });

  it('returns invalid_price for negative offer prices', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Bad',
      offers: { '@type': 'Offer', price: -1, priceCurrency: 'USD' },
    })}</script>`;
    const result = extractPriceFromHtml(html);
    assert.deepEqual(result, { ok: false, reason: 'invalid_price' });
  });
});

describe('collectJsonLdDocuments / flattenJsonLdNodes', () => {
  it('skips malformed JSON-LD script bodies', () => {
    const html = `
      <script type="application/ld+json">{ not json }</script>
      <script type="application/ld+json">{"@type":"Product","name":"Ok","offers":{"price":1,"priceCurrency":"USD"}}</script>
    `;
    const docs = collectJsonLdDocuments(html);
    assert.equal(docs.length, 1);
    const result = extractPriceFromHtml(html);
    assert.equal(result.ok, true);
  });

  it('flattens nested @graph arrays', () => {
    const nodes = flattenJsonLdNodes([
      {
        '@graph': [{ '@type': 'Product', name: 'A' }, { '@type': 'WebPage' }],
      },
    ]);
    assert.equal(nodes.length, 3);
  });
});
