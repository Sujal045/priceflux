import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isWatchDue } from './due.js';

describe('isWatchDue', () => {
  const created = new Date('2026-01-01T00:00:00.000Z');
  const hourMs = 3600_000;

  it('is due when never scraped and createdAt is past interval', () => {
    const now = new Date(created.getTime() + hourMs);
    assert.equal(
      isWatchDue({
        lastScrapedAt: null,
        watchCreatedAt: created,
        watchIntervalMs: hourMs,
        now,
      }),
      true,
    );
  });

  it('is not due when last scrape is within interval', () => {
    const last = new Date('2026-01-01T12:00:00.000Z');
    const now = new Date(last.getTime() + hourMs - 1000);
    assert.equal(
      isWatchDue({
        lastScrapedAt: last,
        watchCreatedAt: created,
        watchIntervalMs: hourMs,
        now,
      }),
      false,
    );
  });

  it('is due when last scrape is at or past interval', () => {
    const last = new Date('2026-01-01T12:00:00.000Z');
    const now = new Date(last.getTime() + hourMs);
    assert.equal(
      isWatchDue({
        lastScrapedAt: last,
        watchCreatedAt: created,
        watchIntervalMs: hourMs,
        now,
      }),
      true,
    );
  });
});
