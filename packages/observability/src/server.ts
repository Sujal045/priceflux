import { createServer, type Server } from 'node:http';

import {
  metricsContentType,
  renderMetrics,
  type ServiceMetrics,
} from './registry.js';

export type MetricsServer = {
  port: number;
  close: () => Promise<void>;
};

/**
 * Serve Prometheus text on GET /metrics (and a tiny /healthz).
 * Used by workers that are not HTTP APIs.
 */
export async function startMetricsServer(
  metrics: ServiceMetrics,
  port: number,
  host = '127.0.0.1',
): Promise<MetricsServer> {
  const server: Server = createServer((req, res) => {
    void (async () => {
      if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({ status: 'ok', service: metrics.serviceName }),
        );
        return;
      }

      if (req.method === 'GET' && req.url === '/metrics') {
        const body = await renderMetrics(metrics);
        res.writeHead(200, { 'content-type': metricsContentType(metrics) });
        res.end(body);
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const boundPort =
    addr && typeof addr === 'object' ? addr.port : port;

  return {
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
