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
  /** HTTP(S) proxy server URL for Chromium. */
  proxyUrl?: string;
  /**
   * Use Patchright + stealth context defaults (UA/locale/viewport + webdriver mask).
   * Off by default for deterministic local fixtures.
   */
  stealth?: boolean;
  /** Abort image/font/media requests (on when stealth is enabled). */
  blockHeavyAssets?: boolean;
};

type LaunchableChromium = {
  launch: (options?: {
    headless?: boolean;
    proxy?: {
      server: string;
      username?: string;
      password?: string;
    };
  }) => Promise<{
    newContext: (options?: Record<string, unknown>) => Promise<{
      addInitScript: (script: string) => Promise<void>;
      newPage: () => Promise<{
        route: (
          url: string,
          handler: (route: {
            request: () => { resourceType: () => string };
            abort: () => Promise<void>;
            continue: () => Promise<void>;
          }) => void | Promise<void>,
        ) => Promise<void>;
        goto: (
          url: string,
          options?: { waitUntil?: string; timeout?: number },
        ) => Promise<{ status: () => number } | null>;
        content: () => Promise<string>;
        url: () => string;
      }>;
      close: () => Promise<void>;
    }>;
    close: () => Promise<void>;
  }>;
};

const STEALTH_INIT_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
window.chrome = window.chrome || { runtime: {} };
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`;

function stealthContextOptions(): Record<string, unknown> {
  return {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1365, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  };
}

function parseProxy(proxyUrl: string): {
  server: string;
  username?: string;
  password?: string;
} {
  const parsed = new URL(proxyUrl);
  const server = `${parsed.protocol}//${parsed.host}`;
  const username = parsed.username
    ? decodeURIComponent(parsed.username)
    : undefined;
  const password = parsed.password
    ? decodeURIComponent(parsed.password)
    : undefined;
  return {
    server,
    ...(username !== undefined && username.length > 0 ? { username } : {}),
    ...(password !== undefined && password.length > 0 ? { password } : {}),
  };
}

async function loadChromium(stealth: boolean): Promise<LaunchableChromium> {
  if (stealth) {
    // Patchright is a Playwright-compatible Chromium with anti-detect patches.
    const mod = await import('patchright');
    return mod.chromium as unknown as LaunchableChromium;
  }
  const mod = await import('playwright');
  return mod.chromium as unknown as LaunchableChromium;
}

/**
 * Shared Chromium browser that opens a fresh context per URL fetch.
 * Close when the worker stops so Chromium processes do not leak.
 */
export async function createPlaywrightFetcher(
  options: PlaywrightFetcherOptions = {},
): Promise<PageFetcher> {
  const headless = options.headless ?? true;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000;
  const stealth = options.stealth ?? false;
  const blockHeavyAssets = options.blockHeavyAssets ?? stealth;

  const chromium = await loadChromium(stealth);
  const browser = await chromium.launch({
    headless,
    ...(options.proxyUrl
      ? { proxy: parseProxy(options.proxyUrl) }
      : {}),
  });

  return {
    async fetchHtml(url: string): Promise<FetchHtmlResult> {
      const context = await browser.newContext(
        stealth ? stealthContextOptions() : {},
      );
      if (stealth) {
        await context.addInitScript(STEALTH_INIT_SCRIPT);
      }

      const page = await context.newPage();
      if (blockHeavyAssets) {
        await page.route('**/*', (route) => {
          const type = route.request().resourceType();
          if (
            type === 'image' ||
            type === 'media' ||
            type === 'font' ||
            type === 'stylesheet'
          ) {
            return route.abort();
          }
          return route.continue();
        });
      }

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
