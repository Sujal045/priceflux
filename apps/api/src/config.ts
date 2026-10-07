export type ApiConfig = {
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  nodeEnv: string;
  /**
   * Origins allowed by CORS for the Web UI.
   * Empty = CORS plugin not registered (API-only / curl clients).
   */
  corsOrigins: string[];
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

/**
 * Resolve HTTP API config from environment (see `.env.example`).
 */
export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const portRaw = env.API_PORT ?? '3000';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid API_PORT: ${portRaw}`);
  }

  const logLevelRaw = (env.LOG_LEVEL ?? 'info').toLowerCase();
  if (!LOG_LEVELS.has(logLevelRaw)) {
    throw new Error(`Invalid LOG_LEVEL: ${env.LOG_LEVEL}`);
  }

  return {
    host: env.API_HOST ?? '0.0.0.0',
    port,
    logLevel: logLevelRaw as ApiConfig['logLevel'],
    nodeEnv: env.NODE_ENV ?? 'development',
    corsOrigins: parseCorsOrigins(env.API_CORS_ORIGINS),
  };
}

/** Comma-separated origins; default local Vite UI in non-production. */
function parseCorsOrigins(raw: string | undefined): string[] {
  if (raw !== undefined) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  // Sensible local default so `pnpm dev:web` works without extra env.
  return ['http://127.0.0.1:5173', 'http://localhost:5173'];
}
