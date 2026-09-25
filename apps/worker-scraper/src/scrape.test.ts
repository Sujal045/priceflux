import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import { ScrapeJobSchema, dedupeKeyForUrl } from '@priceflux/shared';

import { scrapeJob, ScrapeFailure } from './scrape.js';

const SIMPLE_HTML = `<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Acme Widget",
 "offers":{"@type":"Offer","price":29.99,"priceCurrency":"USD"}}
</script>
</head><body></body></html>`;

function sampleJob(url = 'https://shop.example/p/1') {
  return ScrapeJobSchema.parse({
    jobId: randomUUID(),
    url,
    canonicalUrl: url,
    dedupeKey: dedupeKeyForUrl(url),
    userId: randomUUID(),
    watchId: randomUUID(),
    requestedAt: new Date().toISOString(),
  });
}

describe('scrapeJob', () => {
  it('builds a ScrapeResult from JSON-LD HTML', async () => {
    const job = sampleJob();
    const result = await scrapeJob(job, async () => ({
      html: SIMPLE_HTML,
      finalUrl: job.canonicalUrl,
      status: 200,
    }));

    assert.equal(result.jobId, job.jobId);
    assert.equal(result.price, 29.99);
    assert.equal(result.currency, 'USD');
    assert.equal(result.title, 'Acme Widget');
    assert.equal(result.source, 'json_ld');
    assert.equal(result.watchId, job.watchId);
  });

  it('throws ScrapeFailure when extraction finds no JSON-LD', async () => {
    const job = sampleJob();
    await assert.rejects(
      () =>
        scrapeJob(job, async () => ({
          html: '<html><body>no structured data</body></html>',
          finalUrl: job.canonicalUrl,
          status: 200,
        })),
      (err: unknown) => {
        assert.ok(err instanceof ScrapeFailure);
        assert.equal(err.reason, 'no_json_ld');
        return true;
      },
    );
  });

  it('throws ScrapeFailure on HTTP 4xx/5xx', async () => {
    const job = sampleJob();
    await assert.rejects(
      () =>
        scrapeJob(job, async () => ({
          html: '',
          finalUrl: job.canonicalUrl,
          status: 403,
        })),
      (err: unknown) => {
        assert.ok(err instanceof ScrapeFailure);
        assert.equal(err.reason, 'http_403');
        return true;
      },
    );
  });
});
