import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { loadApiConfig } from './config.js';

describe('loadApiConfig', () => {
  it('uses defaults', () => {
    const cfg = loadApiConfig({});
    assert.equal(cfg.host, '0.0.0.0');
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.logLevel, 'info');
  });

  it('reads API_HOST and API_PORT', () => {
    const cfg = loadApiConfig({
      API_HOST: '127.0.0.1',
      API_PORT: '4000',
      LOG_LEVEL: 'warn',
      NODE_ENV: 'test',
    });
    assert.equal(cfg.host, '127.0.0.1');
    assert.equal(cfg.port, 4000);
    assert.equal(cfg.logLevel, 'warn');
    assert.equal(cfg.nodeEnv, 'test');
  });

  it('rejects invalid ports', () => {
    assert.throws(() => loadApiConfig({ API_PORT: 'nope' }), /Invalid API_PORT/);
  });
});

describe('GET /healthz', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp({
      config: loadApiConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      logger: false,
      withInfra: false,
    });
  });

  after(async () => {
    await app.close();
  });

  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'ok', service: 'api' });
    assert.ok(res.headers['x-request-id']);
  });

  it('exposes prometheus metrics', async () => {
    await app.inject({ method: 'GET', url: '/healthz' });
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] ?? '', /text\/plain|openmetrics/);
    assert.match(res.body, /priceflux_http_requests_total/);
    assert.match(res.body, /service="api"/);
  });

  it('echoes client x-request-id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'test-corr-123' },
    });
    assert.equal(res.headers['x-request-id'], 'test-corr-123');
  });
});
