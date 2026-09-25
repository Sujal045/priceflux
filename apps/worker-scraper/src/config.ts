export type ScraperWorkerConfig = {
  prefetch: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
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

  return {
    prefetch,
    logLevel: logLevelRaw as ScraperWorkerConfig['logLevel'],
  };
}
