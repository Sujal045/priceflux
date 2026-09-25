import { extractPriceFromHtml } from '@priceflux/scrape-core';
import {
  ScrapeResultSchema,
  type ScrapeJob,
  type ScrapeResult,
} from '@priceflux/shared';

import type { FetchHtmlResult } from './browser.js';

export class ScrapeFailure extends Error {
  readonly reason: string;

  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.name = 'ScrapeFailure';
    this.reason = reason;
  }
}

export type FetchHtml = (url: string) => Promise<FetchHtmlResult>;

/**
 * Happy-path scrape: load the page, extract JSON-LD price, build a result.
 * Does not publish or ack — callers own broker I/O.
 */
export async function scrapeJob(
  job: ScrapeJob,
  fetchHtml: FetchHtml,
): Promise<ScrapeResult> {
  const page = await fetchHtml(job.canonicalUrl);

  if (page.status > 0 && page.status >= 400) {
    throw new ScrapeFailure(
      `http_${page.status}`,
      `Page returned HTTP ${page.status} for ${job.canonicalUrl}`,
    );
  }

  const extracted = extractPriceFromHtml(page.html);
  if (!extracted.ok) {
    throw new ScrapeFailure(
      extracted.reason,
      `Price extraction failed (${extracted.reason}) for ${job.canonicalUrl}`,
    );
  }

  return ScrapeResultSchema.parse({
    jobId: job.jobId,
    url: job.url,
    canonicalUrl: job.canonicalUrl,
    userId: job.userId,
    ...(job.watchId !== undefined ? { watchId: job.watchId } : {}),
    price: extracted.data.price,
    currency: extracted.data.currency,
    ...(extracted.data.title !== undefined
      ? { title: extracted.data.title }
      : {}),
    scrapedAt: new Date().toISOString(),
    source: extracted.data.source,
  });
}
