import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadNotifierWorkerConfig, loadSmtpConfig } from './config.js';

describe('loadNotifierWorkerConfig', () => {
  it('uses defaults', () => {
    const cfg = loadNotifierWorkerConfig({});
    assert.equal(cfg.prefetch, 10);
    assert.equal(cfg.logLevel, 'info');
    assert.equal(cfg.webhookUrl, undefined);
    assert.equal(cfg.smtp, undefined);
    assert.equal(cfg.metricsPort, 9102);
  });

  it('reads prefetch and webhook URL', () => {
    const cfg = loadNotifierWorkerConfig({
      WORKER_NOTIFIER_PREFETCH: '3',
      LOG_LEVEL: 'warn',
      NOTIFIER_WEBHOOK_URL: 'https://hooks.example/drop',
      WORKER_NOTIFIER_METRICS_PORT: '0',
    });
    assert.equal(cfg.prefetch, 3);
    assert.equal(cfg.logLevel, 'warn');
    assert.equal(cfg.webhookUrl, 'https://hooks.example/drop');
    assert.equal(cfg.metricsPort, 0);
  });

  it('reads SMTP when host is set', () => {
    const cfg = loadNotifierWorkerConfig({
      NOTIFIER_SMTP_HOST: '127.0.0.1',
      NOTIFIER_SMTP_PORT: '1025',
      NOTIFIER_SMTP_FROM: 'alerts@priceflux.local',
      NOTIFIER_SMTP_USER: 'mailuser',
      NOTIFIER_SMTP_PASS: 'secret',
      NOTIFIER_SMTP_SECURE: 'false',
      NOTIFIER_SMTP_REQUIRE_TLS: 'false',
    });
    assert.deepEqual(cfg.smtp, {
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      from: 'alerts@priceflux.local',
      requireTls: false,
      user: 'mailuser',
      pass: 'secret',
    });
  });

  it('rejects invalid prefetch', () => {
    assert.throws(
      () => loadNotifierWorkerConfig({ WORKER_NOTIFIER_PREFETCH: '0' }),
      /Invalid WORKER_NOTIFIER_PREFETCH/,
    );
  });

  it('rejects invalid SMTP port', () => {
    assert.throws(
      () =>
        loadSmtpConfig({
          NOTIFIER_SMTP_HOST: '127.0.0.1',
          NOTIFIER_SMTP_PORT: '0',
        }),
      /Invalid NOTIFIER_SMTP_PORT/,
    );
  });
});
