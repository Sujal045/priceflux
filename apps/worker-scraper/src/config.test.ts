import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadScraperWorkerConfig } from './config.js';

describe('loadScraperWorkerConfig', () => {
  it('uses defaults', () => {
    const cfg = loadScraperWorkerConfig({});
    assert.equal(cfg.prefetch, 5);
    assert.equal(cfg.logLevel, 'info');
    assert.equal(cfg.headless, true);
    assert.equal(cfg.navigationTimeoutMs, 30_000);
    assert.equal(cfg.metricsPort, 9101);
  });

  it('reads WORKER_SCRAPER_PREFETCH and browser options', () => {
    const cfg = loadScraperWorkerConfig({
      WORKER_SCRAPER_PREFETCH: '2',
      LOG_LEVEL: 'warn',
      WORKER_SCRAPER_HEADLESS: 'false',
      WORKER_SCRAPER_NAVIGATION_TIMEOUT_MS: '12000',
      WORKER_SCRAPER_METRICS_PORT: '0',
    });
    assert.equal(cfg.prefetch, 2);
    assert.equal(cfg.logLevel, 'warn');
    assert.equal(cfg.headless, false);
    assert.equal(cfg.navigationTimeoutMs, 12_000);
    assert.equal(cfg.metricsPort, 0);
  });

  it('rejects invalid prefetch', () => {
    assert.throws(
      () => loadScraperWorkerConfig({ WORKER_SCRAPER_PREFETCH: '0' }),
      /Invalid WORKER_SCRAPER_PREFETCH/,
    );
  });

  it('rejects invalid headless', () => {
    assert.throws(
      () => loadScraperWorkerConfig({ WORKER_SCRAPER_HEADLESS: 'maybe' }),
      /Invalid WORKER_SCRAPER_HEADLESS/,
    );
  });
});
