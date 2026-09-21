export const PACKAGE_NAME = '@priceflux/mq' as const;

export { loadRabbitMqConfig, type RabbitMqConfig } from './config.js';
export { connectRabbitMq, type RabbitConnection } from './connection.js';
export {
  assertTopology,
  publishJson,
  publishScrapeJob,
  publishScrapeResult,
  type PublishJsonInput,
  type PublishScrapeJobInput,
} from './publish.js';
