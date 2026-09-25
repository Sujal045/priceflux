import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadNotifierWorkerConfig } from './config.js';

describe('loadNotifierWorkerConfig', () => {
  it('uses defaults', () => {
    const cfg = loadNotifierWorkerConfig({});
    assert.equal(cfg.prefetch, 10);
    assert.equal(cfg.logLevel, 'info');
    assert.equal(cfg.webhookUrl, undefined);
  });

  it('reads prefetch and webhook URL', () => {
    const cfg = loadNotifierWorkerConfig({
      WORKER_NOTIFIER_PREFETCH: '3',
      LOG_LEVEL: 'warn',
      NOTIFIER_WEBHOOK_URL: 'https://hooks.example/drop',
    });
    assert.equal(cfg.prefetch, 3);
    assert.equal(cfg.logLevel, 'warn');
    assert.equal(cfg.webhookUrl, 'https://hooks.example/drop');
  });

  it('rejects invalid prefetch', () => {
    assert.throws(
      () => loadNotifierWorkerConfig({ WORKER_NOTIFIER_PREFETCH: '0' }),
      /Invalid WORKER_NOTIFIER_PREFETCH/,
    );
  });
});
