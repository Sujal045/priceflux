import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveCorrelationId, CORRELATION_HEADERS } from './correlation.js';
import { createServiceMetrics, renderMetrics } from './registry.js';
import { refreshQueueDepths } from './queues.js';

describe('resolveCorrelationId', () => {
  it('prefers x-correlation-id then x-request-id then fallback', () => {
    assert.equal(
      resolveCorrelationId(
        {
          [CORRELATION_HEADERS.correlationId]: 'corr-1',
          [CORRELATION_HEADERS.requestId]: 'req-1',
        },
        'fallback',
      ),
      'corr-1',
    );
    assert.equal(
      resolveCorrelationId(
        { [CORRELATION_HEADERS.requestId]: 'req-2' },
        'fallback',
      ),
      'req-2',
    );
    assert.equal(resolveCorrelationId({}, 'job-9'), 'job-9');
  });
});

describe('createServiceMetrics', () => {
  it('renders prometheus text with service label', async () => {
    const metrics = createServiceMetrics('api');
    metrics.httpRequestsTotal.inc({
      method: 'GET',
      route: '/healthz',
      status_code: '200',
    });
    metrics.jobsTotal.inc({ worker: 'scraper', outcome: 'success' });
    metrics.queueMessages.set({ queue: 'scrape.jobs' }, 3);

    const text = await renderMetrics(metrics);
    assert.match(text, /priceflux_http_requests_total/);
    assert.match(text, /priceflux_jobs_total/);
    assert.match(text, /priceflux_queue_messages\{queue="scrape\.jobs"/);
    assert.match(text, /service="api"/);
    assert.match(text, /\} 3\n/);
  });
});

describe('refreshQueueDepths', () => {
  it('sets gauges from queue reader', async () => {
    const metrics = createServiceMetrics('test');
    await refreshQueueDepths(
      metrics,
      {
        checkQueue: async (queue) => ({
          messageCount: queue === 'scrape.dead' ? 2 : 0,
        }),
      },
      ['scrape.jobs', 'scrape.dead'],
    );

    const text = await renderMetrics(metrics);
    assert.match(text, /queue="scrape\.dead".* 2/);
  });
});
