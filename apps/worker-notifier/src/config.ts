export type SmtpConfig = {
  host: string;
  port: number;
  /** Use TLS from the first byte (typically port 465). */
  secure: boolean;
  /** Optional SMTP AUTH user. */
  user?: string;
  /** Optional SMTP AUTH password (from env only). */
  pass?: string;
  /** Envelope From address. */
  from: string;
  /** Upgrade the connection with STARTTLS (Mailpit usually false). */
  requireTls: boolean;
};

export type NotifierWorkerConfig = {
  prefetch: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  /** Optional webhook URL for drop alerts (POST JSON). */
  webhookUrl?: string;
  /**
   * Optional SMTP settings. When unset, the email emitter is not composed
   * (local fixtures keep working with log ± webhook only).
   */
  smtp?: SmtpConfig;
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

  const metricsPortRaw = env.WORKER_NOTIFIER_METRICS_PORT ?? '9102';
  const metricsPort = Number(metricsPortRaw);
  if (
    !Number.isInteger(metricsPort) ||
    metricsPort < 0 ||
    metricsPort > 65535
  ) {
    throw new Error(`Invalid WORKER_NOTIFIER_METRICS_PORT: ${metricsPortRaw}`);
  }

  const smtp = loadSmtpConfig(env);

  return {
    prefetch,
    logLevel: logLevelRaw as NotifierWorkerConfig['logLevel'],
    metricsPort,
    ...(webhookUrl && webhookUrl.length > 0 ? { webhookUrl } : {}),
    ...(smtp ? { smtp } : {}),
  };
}

/**
 * SMTP is enabled when `NOTIFIER_SMTP_HOST` is set.
 * Host unset → no email channel (no-op for local fixtures).
 */
export function loadSmtpConfig(
  env: NodeJS.ProcessEnv = process.env,
): SmtpConfig | undefined {
  const host = env.NOTIFIER_SMTP_HOST?.trim();
  if (!host) {
    return undefined;
  }

  const portRaw = env.NOTIFIER_SMTP_PORT ?? '1025';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid NOTIFIER_SMTP_PORT: ${portRaw}`);
  }

  const from = env.NOTIFIER_SMTP_FROM?.trim() || 'priceflux@localhost';
  const user = env.NOTIFIER_SMTP_USER?.trim();
  const pass = env.NOTIFIER_SMTP_PASS;
  const secure = parseBool(env.NOTIFIER_SMTP_SECURE, false);
  const requireTls = parseBool(env.NOTIFIER_SMTP_REQUIRE_TLS, false);

  return {
    host,
    port,
    secure,
    from,
    requireTls,
    ...(user && user.length > 0 ? { user } : {}),
    ...(pass !== undefined && pass.length > 0 ? { pass } : {}),
  };
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') {
    return true;
  }
  if (v === '0' || v === 'false' || v === 'no') {
    return false;
  }
  throw new Error(`Invalid boolean env value: ${raw}`);
}
