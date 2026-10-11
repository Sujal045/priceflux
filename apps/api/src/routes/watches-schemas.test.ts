import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CreateWatchBodySchema,
  ListWatchesQuerySchema,
  UpdateWatchBodySchema,
  WatchHistoryQuerySchema,
} from './watches-schemas.js';

describe('CreateWatchBodySchema', () => {
  it('accepts a valid body', () => {
    const body = CreateWatchBodySchema.parse({
      email: 'user@example.com',
      url: 'https://shop.example/p/1',
      threshold: 19.99,
      currency: 'USD',
    });
    assert.equal(body.email, 'user@example.com');
  });

  it('rejects invalid email', () => {
    assert.throws(() =>
      CreateWatchBodySchema.parse({
        email: 'not-an-email',
        url: 'https://shop.example/p/1',
      }),
    );
  });
});

describe('UpdateWatchBodySchema', () => {
  it('requires at least one field', () => {
    assert.throws(() => UpdateWatchBodySchema.parse({}));
  });

  it('accepts active toggle', () => {
    const body = UpdateWatchBodySchema.parse({ active: false });
    assert.equal(body.active, false);
  });
});

describe('ListWatchesQuerySchema', () => {
  it('requires email', () => {
    assert.throws(() => ListWatchesQuerySchema.parse({}));
    const q = ListWatchesQuerySchema.parse({ email: 'a@b.co' });
    assert.equal(q.email, 'a@b.co');
  });
});

describe('WatchHistoryQuerySchema', () => {
  it('defaults limit to 50', () => {
    const q = WatchHistoryQuerySchema.parse({});
    assert.equal(q.limit, 50);
  });

  it('coerces a string limit from the query string', () => {
    const q = WatchHistoryQuerySchema.parse({ limit: '10' });
    assert.equal(q.limit, 10);
  });

  it('rejects non-positive or oversized limits', () => {
    assert.throws(() => WatchHistoryQuerySchema.parse({ limit: '0' }));
    assert.throws(() => WatchHistoryQuerySchema.parse({ limit: '501' }));
  });
});
