import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadDatabaseConfig } from './config.js';
import { migrationsFolder } from './migrate.js';

describe('loadDatabaseConfig', () => {
  it('prefers DATABASE_URL', () => {
    const cfg = loadDatabaseConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      POSTGRES_USER: 'ignored',
    });
    assert.equal(cfg.url, 'postgresql://u:p@localhost:5432/db');
  });

  it('builds a URL from discrete env vars', () => {
    const cfg = loadDatabaseConfig({
      POSTGRES_USER: 'priceflux',
      POSTGRES_PASSWORD: 'secret',
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '5433',
      POSTGRES_DB: 'priceflux',
    });
    assert.equal(
      cfg.url,
      'postgresql://priceflux:secret@127.0.0.1:5433/priceflux',
    );
  });
});

describe('migrationsFolder', () => {
  it('points at the package drizzle directory', () => {
    const folder = migrationsFolder();
    assert.match(folder, /packages\/db\/drizzle$/);
  });
});
