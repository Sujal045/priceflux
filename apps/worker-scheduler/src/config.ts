export type SchedulerWorkerConfig = {
  /** How often the scheduler wakes to scan watches (seconds). */
  pollIntervalSeconds: number;
  /** Minimum time between scrapes for the same watch (seconds). */
  watchIntervalSeconds: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Prometheus scrape port; `0` disables the metrics HTTP server. */
  metricsPort: number;
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

export function loadSchedulerWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): SchedulerWorkerConfig {
  const pollIntervalRaw = env.SCHEDULER_POLL_INTERVAL_SECONDS ?? '300';
  const pollIntervalSeconds = Number(pollIntervalRaw);
  if (
    !Number.isInteger(pollIntervalSeconds) ||
    pollIntervalSeconds <= 0
  ) {
    throw new Error(
      `Invalid SCHEDULER_POLL_INTERVAL_SECONDS: ${pollIntervalRaw}`,
    );
  }

  const watchIntervalRaw = env.SCHEDULER_WATCH_INTERVAL_SECONDS ?? '3600';
  const watchIntervalSeconds = Number(watchIntervalRaw);
  if (
    !Number.isInteger(watchIntervalSeconds) ||
    watchIntervalSeconds <= 0
  ) {
    throw new Error(
      `Invalid SCHEDULER_WATCH_INTERVAL_SECONDS: ${watchIntervalRaw}`,
    );
  }

  const logLevelRaw = (env.LOG_LEVEL ?? 'info').toLowerCase();
  if (!LOG_LEVELS.has(logLevelRaw)) {
    throw new Error(`Invalid LOG_LEVEL: ${env.LOG_LEVEL}`);
  }

  const metricsPortRaw = env.WORKER_SCHEDULER_METRICS_PORT ?? '9103';
  const metricsPort = Number(metricsPortRaw);
  if (
    !Number.isInteger(metricsPort) ||
    metricsPort < 0 ||
    metricsPort > 65535
  ) {
    throw new Error(`Invalid WORKER_SCHEDULER_METRICS_PORT: ${metricsPortRaw}`);
  }

  return {
    pollIntervalSeconds,
    watchIntervalSeconds,
    logLevel: logLevelRaw as SchedulerWorkerConfig['logLevel'],
    metricsPort,
  };
}
