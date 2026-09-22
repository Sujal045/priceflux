export type RedisConfig = {
  url: string;
};

/**
 * Resolve Redis URL from environment.
 * Prefers `REDIS_URL`, otherwise builds from host/port (see `.env.example`).
 */
export function loadRedisConfig(
  env: NodeJS.ProcessEnv = process.env,
): RedisConfig {
  if (env.REDIS_URL && env.REDIS_URL.length > 0) {
    return { url: env.REDIS_URL };
  }

  const host = env.REDIS_HOST ?? '127.0.0.1';
  const port = env.REDIS_PORT ?? '6379';
  const password = env.REDIS_PASSWORD;

  if (password && password.length > 0) {
    return {
      url: `redis://:${encodeURIComponent(password)}@${host}:${port}`,
    };
  }

  return { url: `redis://${host}:${port}` };
}
