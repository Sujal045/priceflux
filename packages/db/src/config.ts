export type DatabaseConfig = {
  url: string;
};

/**
 * Resolve Postgres URL from environment.
 * Prefers `DATABASE_URL` (see `.env.example`).
 */
export function loadDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  if (env.DATABASE_URL && env.DATABASE_URL.length > 0) {
    return { url: env.DATABASE_URL };
  }

  const user = env.POSTGRES_USER ?? 'priceflux';
  const password = env.POSTGRES_PASSWORD ?? 'priceflux';
  const host = env.POSTGRES_HOST ?? '127.0.0.1';
  const port = env.POSTGRES_PORT ?? '5432';
  const database = env.POSTGRES_DB ?? 'priceflux';

  return {
    url: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`,
  };
}
