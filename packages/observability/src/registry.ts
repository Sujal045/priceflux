import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

export type ServiceMetrics = {
  registry: Registry;
  serviceName: string;
  httpRequestsTotal: Counter<'method' | 'route' | 'status_code'>;
  httpRequestDurationSeconds: Histogram<'method' | 'route' | 'status_code'>;
  jobsTotal: Counter<'worker' | 'outcome'>;
  jobDurationSeconds: Histogram<'worker' | 'outcome'>;
  alertsTotal: Counter<'outcome'>;
  queueMessages: Gauge<'queue'>;
};

/**
 * Create a Prometheus registry labeled for one Priceflux process.
 * Default Node process metrics are included (CPU, memory, event loop).
 */
export function createServiceMetrics(serviceName: string): ServiceMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });
  collectDefaultMetrics({ register: registry });

  const httpRequestsTotal = new Counter({
    name: 'priceflux_http_requests_total',
    help: 'HTTP requests handled by the API',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });

  const httpRequestDurationSeconds = new Histogram({
    name: 'priceflux_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const jobsTotal = new Counter({
    name: 'priceflux_jobs_total',
    help: 'Worker jobs processed',
    labelNames: ['worker', 'outcome'] as const,
    registers: [registry],
  });

  const jobDurationSeconds = new Histogram({
    name: 'priceflux_job_duration_seconds',
    help: 'Worker job duration in seconds',
    labelNames: ['worker', 'outcome'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 30, 60],
    registers: [registry],
  });

  const alertsTotal = new Counter({
    name: 'priceflux_alerts_total',
    help: 'Price-drop alerts emitted by the notifier',
    labelNames: ['outcome'] as const,
    registers: [registry],
  });

  const queueMessages = new Gauge({
    name: 'priceflux_queue_messages',
    help: 'RabbitMQ queue depth (ready messages)',
    labelNames: ['queue'] as const,
    registers: [registry],
  });

  return {
    registry,
    serviceName,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    jobsTotal,
    jobDurationSeconds,
    alertsTotal,
    queueMessages,
  };
}

export async function renderMetrics(metrics: ServiceMetrics): Promise<string> {
  return metrics.registry.metrics();
}

export function metricsContentType(metrics: ServiceMetrics): string {
  return metrics.registry.contentType;
}
