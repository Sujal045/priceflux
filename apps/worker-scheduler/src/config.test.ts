import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadSchedulerWorkerConfig } from './config.js';

describe('loadSchedulerWorkerConfig', () => {
  it('uses defaults', () => {
    const cfg = loadSchedulerWorkerConfig({});
    assert.equal(cfg.pollIntervalSeconds, 300);
    assert.equal(cfg.watchIntervalSeconds, 3600);
    assert.equal(cfg.logLevel, 'info');
    assert.equal(cfg.metricsPort, 9103);
  });

  it('reads poll and watch intervals', () => {
    const cfg = loadSchedulerWorkerConfig({
      SCHEDULER_POLL_INTERVAL_SECONDS: '60',
      SCHEDULER_WATCH_INTERVAL_SECONDS: '900',
      WORKER_SCHEDULER_METRICS_PORT: '0',
      LOG_LEVEL: 'warn',
    });
    assert.equal(cfg.pollIntervalSeconds, 60);
    assert.equal(cfg.watchIntervalSeconds, 900);
    assert.equal(cfg.metricsPort, 0);
    assert.equal(cfg.logLevel, 'warn');
  });

  it('rejects invalid poll interval', () => {
    assert.throws(
      () =>
        loadSchedulerWorkerConfig({ SCHEDULER_POLL_INTERVAL_SECONDS: '0' }),
      /Invalid SCHEDULER_POLL_INTERVAL_SECONDS/,
    );
  });
});
