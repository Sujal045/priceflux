import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadScraperWorkerConfig } from './config.js';

describe('loadScraperWorkerConfig', () => {
  it('uses defaults (stealth/proxy off for fixtures)', () => {
    const cfg = loadScraperWorkerConfig({});
    assert.equal(cfg.prefetch, 5);
    assert.equal(cfg.logLevel, 'info');
    assert.equal(cfg.headless, true);
    assert.equal(cfg.navigationTimeoutMs, 30_000);
    assert.equal(cfg.metricsPort, 9101);
    assert.equal(cfg.stealth, false);
    assert.equal(cfg.proxyUrl, undefined);
    assert.equal(cfg.domainRateLimit, 30);
    assert.equal(cfg.domainRateWindowSeconds, 60);
  });

  it('reads anti-bot and browser options', () => {
    const cfg = loadScraperWorkerConfig({
      WORKER_SCRAPER_PREFETCH: '2',
      LOG_LEVEL: 'warn',
      WORKER_SCRAPER_HEADLESS: 'false',
      WORKER_SCRAPER_NAVIGATION_TIMEOUT_MS: '12000',
      WORKER_SCRAPER_METRICS_PORT: '0',
      SCRAPER_STEALTH: 'true',
      SCRAPER_PROXY_URL: 'http://user:pass@127.0.0.1:8888',
      SCRAPER_DOMAIN_RATE_LIMIT: '5',
      SCRAPER_DOMAIN_RATE_WINDOW_SECONDS: '120',
    });
    assert.equal(cfg.prefetch, 2);
    assert.equal(cfg.logLevel, 'warn');
    assert.equal(cfg.headless, false);
    assert.equal(cfg.navigationTimeoutMs, 12_000);
    assert.equal(cfg.metricsPort, 0);
    assert.equal(cfg.stealth, true);
    assert.equal(cfg.proxyUrl, 'http://user:pass@127.0.0.1:8888');
    assert.equal(cfg.domainRateLimit, 5);
    assert.equal(cfg.domainRateWindowSeconds, 120);
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

  it('rejects invalid proxy URL', () => {
    assert.throws(
      () => loadScraperWorkerConfig({ SCRAPER_PROXY_URL: 'not-a-url' }),
      /Invalid SCRAPER_PROXY_URL/,
    );
  });
});
