export type ScraperWorkerConfig = {
  prefetch: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  headless: boolean;
  navigationTimeoutMs: number;
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

  return {
    prefetch,
    logLevel: logLevelRaw as ScraperWorkerConfig['logLevel'],
    headless,
    navigationTimeoutMs,
  };
}
