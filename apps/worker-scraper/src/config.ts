export type ScraperWorkerConfig = {
  prefetch: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  headless: boolean;
  navigationTimeoutMs: number;
  /** Prometheus scrape port; `0` disables the metrics HTTP server. */
  metricsPort: number;
  /**
   * Optional HTTP(S) proxy for Chromium (`http://user:pass@host:port`).
   * Unset = direct connection (local fixtures).
   */
  proxyUrl?: string;
  /**
   * When true, launch via Patchright and apply stealth context defaults.
   * Default false so local fixtures stay on plain Playwright.
   */
  stealth: boolean;
  /**
   * Max scrapes per domain per window. `0` disables Redis domain limiting.
   */
  domainRateLimit: number;
  domainRateWindowSeconds: number;
};

const LOG_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function parseBoolean(raw: string, envName: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  throw new Error(`Invalid ${envName}: ${raw}`);
}

function parseOptionalProxyUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid SCRAPER_PROXY_URL: ${raw}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid SCRAPER_PROXY_URL protocol (use http/https): ${raw}`,
    );
  }
  return trimmed;
}

export function loadScraperWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ScraperWorkerConfig {
  const prefetchRaw = env.WORKER_SCRAPER_PREFETCH ?? '5';
  const prefetch = Number(prefetchRaw);
  if (!Number.isInteger(prefetch) || prefetch <= 0) {
    throw new Error(`Invalid WORKER_SCRAPER_PREFETCH: ${prefetchRaw}`);
  }

  const logLevelRaw = (env.LOG_LEVEL ?? 'info').toLowerCase();
  if (!LOG_LEVELS.has(logLevelRaw)) {
    throw new Error(`Invalid LOG_LEVEL: ${env.LOG_LEVEL}`);
  }

  const headless = parseBoolean(
    env.WORKER_SCRAPER_HEADLESS ?? 'true',
    'WORKER_SCRAPER_HEADLESS',
  );

  const timeoutRaw = env.WORKER_SCRAPER_NAVIGATION_TIMEOUT_MS ?? '30000';
  const navigationTimeoutMs = Number(timeoutRaw);
  if (
    !Number.isInteger(navigationTimeoutMs) ||
    navigationTimeoutMs <= 0
  ) {
    throw new Error(
      `Invalid WORKER_SCRAPER_NAVIGATION_TIMEOUT_MS: ${timeoutRaw}`,
    );
  }

  const metricsPortRaw = env.WORKER_SCRAPER_METRICS_PORT ?? '9101';
  const metricsPort = Number(metricsPortRaw);
  if (
    !Number.isInteger(metricsPort) ||
    metricsPort < 0 ||
    metricsPort > 65535
  ) {
    throw new Error(`Invalid WORKER_SCRAPER_METRICS_PORT: ${metricsPortRaw}`);
  }

  const stealth = parseBoolean(
    env.SCRAPER_STEALTH ?? 'false',
    'SCRAPER_STEALTH',
  );

  const proxyUrl = parseOptionalProxyUrl(env.SCRAPER_PROXY_URL);

  const rateLimitRaw = env.SCRAPER_DOMAIN_RATE_LIMIT ?? '30';
  const domainRateLimit = Number(rateLimitRaw);
  if (!Number.isInteger(domainRateLimit) || domainRateLimit < 0) {
    throw new Error(`Invalid SCRAPER_DOMAIN_RATE_LIMIT: ${rateLimitRaw}`);
  }

  const windowRaw = env.SCRAPER_DOMAIN_RATE_WINDOW_SECONDS ?? '60';
  const domainRateWindowSeconds = Number(windowRaw);
  if (
    !Number.isInteger(domainRateWindowSeconds) ||
    domainRateWindowSeconds <= 0
  ) {
    throw new Error(
      `Invalid SCRAPER_DOMAIN_RATE_WINDOW_SECONDS: ${windowRaw}`,
    );
  }

  return {
    prefetch,
    logLevel: logLevelRaw as ScraperWorkerConfig['logLevel'],
    headless,
    navigationTimeoutMs,
    metricsPort,
    stealth,
    domainRateLimit,
    domainRateWindowSeconds,
    ...(proxyUrl !== undefined ? { proxyUrl } : {}),
  };
}
