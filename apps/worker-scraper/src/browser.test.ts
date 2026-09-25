import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createPlaywrightFetcher, type PageFetcher } from './browser.js';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/scrape-core/fixtures',
);

describe('createPlaywrightFetcher', () => {
  let server: Server;
  let baseUrl: string;
  let fetcher: PageFetcher;

  before(async () => {
    const html = await readFile(join(fixturesDir, 'product-simple.html'), 'utf8');
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    baseUrl = `http://127.0.0.1:${addr.port}/product`;
    fetcher = await createPlaywrightFetcher({
      headless: true,
      navigationTimeoutMs: 15_000,
    });
  });

  after(async () => {
    await fetcher.close();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('loads fixture HTML via Chromium', async () => {
    const page = await fetcher.fetchHtml(baseUrl);
    assert.equal(page.status, 200);
    assert.match(page.html, /Acme Widget/);
    assert.match(page.html, /application\/ld\+json/);
  });
});
