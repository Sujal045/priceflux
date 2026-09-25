import { chromium, type Browser } from 'playwright';

export type FetchHtmlResult = {
  html: string;
  finalUrl: string;
  status: number;
};

export type PageFetcher = {
  fetchHtml: (url: string) => Promise<FetchHtmlResult>;
  close: () => Promise<void>;
};

export type PlaywrightFetcherOptions = {
  headless?: boolean;
  navigationTimeoutMs?: number;
};

/**
 * Shared Chromium browser that opens a fresh context per URL fetch.
 * Close when the worker stops so Chromium processes do not leak.
 */
export async function createPlaywrightFetcher(
  options: PlaywrightFetcherOptions = {},
): Promise<PageFetcher> {
  const headless = options.headless ?? true;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000;

  const browser: Browser = await chromium.launch({ headless });

  return {
    async fetchHtml(url: string): Promise<FetchHtmlResult> {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: navigationTimeoutMs,
        });
        const html = await page.content();
        return {
          html,
          finalUrl: page.url(),
          status: response?.status() ?? 0,
        };
      } finally {
        await context.close();
      }
    },
    async close(): Promise<void> {
      await browser.close();
    },
  };
}
