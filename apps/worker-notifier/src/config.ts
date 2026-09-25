export type NotifierWorkerConfig = {
  prefetch: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Optional webhook URL for drop alerts (POST JSON). */
  webhookUrl?: string;
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

export function loadNotifierWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): NotifierWorkerConfig {
  const prefetchRaw = env.WORKER_NOTIFIER_PREFETCH ?? '10';
  const prefetch = Number(prefetchRaw);
  if (!Number.isInteger(prefetch) || prefetch <= 0) {
    throw new Error(`Invalid WORKER_NOTIFIER_PREFETCH: ${prefetchRaw}`);
  }

  const logLevelRaw = (env.LOG_LEVEL ?? 'info').toLowerCase();
  if (!LOG_LEVELS.has(logLevelRaw)) {
    throw new Error(`Invalid LOG_LEVEL: ${env.LOG_LEVEL}`);
  }

  const webhookUrl = env.NOTIFIER_WEBHOOK_URL?.trim();

  return {
    prefetch,
    logLevel: logLevelRaw as NotifierWorkerConfig['logLevel'],
    ...(webhookUrl && webhookUrl.length > 0 ? { webhookUrl } : {}),
  };
}
