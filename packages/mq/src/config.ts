export type RabbitMqConfig = {
  url: string;
};

/**
 * Resolve broker URL from environment.
 * Prefers `RABBITMQ_URL`, otherwise builds from discrete vars (see `.env.example`).
 */
export function loadRabbitMqConfig(
  env: NodeJS.ProcessEnv = process.env,
): RabbitMqConfig {
  if (env.RABBITMQ_URL && env.RABBITMQ_URL.length > 0) {
    return { url: env.RABBITMQ_URL };
  }

  const user = env.RABBITMQ_USER ?? 'priceflux';
  const password = env.RABBITMQ_PASSWORD ?? 'priceflux';
  const host = env.RABBITMQ_HOST ?? '127.0.0.1';
  const port = env.RABBITMQ_PORT ?? '5672';
  const vhost = env.RABBITMQ_VHOST ?? 'priceflux';

  const encodedVhost = encodeURIComponent(vhost);
  return {
    url: `amqp://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodedVhost}`,
  };
}
