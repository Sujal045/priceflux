import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadScraperWorkerConfig } from './config.js';

describe('loadScraperWorkerConfig', () => {
  it('uses defaults', () => {
    const cfg = loadScraperWorkerConfig({});
    assert.equal(cfg.prefetch, 5);
    assert.equal(cfg.logLevel, 'info');
  });

  it('reads WORKER_SCRAPER_PREFETCH', () => {
    const cfg = loadScraperWorkerConfig({
      WORKER_SCRAPER_PREFETCH: '2',
      LOG_LEVEL: 'warn',
    });
    assert.equal(cfg.prefetch, 2);
    assert.equal(cfg.logLevel, 'warn');
  });

  it('rejects invalid prefetch', () => {
    assert.throws(
      () => loadScraperWorkerConfig({ WORKER_SCRAPER_PREFETCH: '0' }),
      /Invalid WORKER_SCRAPER_PREFETCH/,
    );
  });
});
