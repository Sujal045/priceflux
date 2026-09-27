export const PACKAGE_NAME = '@priceflux/observability' as const;

export {
  CORRELATION_HEADERS,
  resolveCorrelationId,
} from './correlation.js';
export {
  createServiceMetrics,
  metricsContentType,
  renderMetrics,
  type ServiceMetrics,
} from './registry.js';
export {
  asQueueDepthReader,
  refreshQueueDepths,
  startQueueLagPoller,
  type QueueDepthReader,
  type QueueLagPoller,
} from './queues.js';
export { startMetricsServer, type MetricsServer } from './server.js';
