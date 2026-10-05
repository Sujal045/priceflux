# Observability baseline (stage 15)

Priceflux exports **Prometheus** metrics and propagates **correlation ids**.
There is no Grafana/OTel collector required for local use — scrape the text
endpoints with `curl` or point Prometheus at them.

## Endpoints

| Process | URL | Notes |
|---------|-----|--------|
| API | `http://127.0.0.1:3000/metrics` | Same server as `/healthz` |
| Scraper worker | `http://127.0.0.1:9101/metrics` | `WORKER_SCRAPER_METRICS_PORT` (set `0` to disable) |
| Notifier worker | `http://127.0.0.1:9102/metrics` | `WORKER_NOTIFIER_METRICS_PORT` (set `0` to disable) |

Workers also expose `GET /healthz` on their metrics port.

```bash
curl -s http://127.0.0.1:3000/metrics | head
curl -s http://127.0.0.1:9101/metrics | rg 'priceflux_jobs|priceflux_queue'
curl -s http://127.0.0.1:9102/metrics | rg 'priceflux_alerts|priceflux_jobs'
```

## Metric catalog

| Metric | Type | Labels | Meaning |
|--------|------|--------|---------|
| `priceflux_http_requests_total` | counter | method, route, status_code | API requests |
| `priceflux_http_request_duration_seconds` | histogram | method, route, status_code | API latency |
| `priceflux_jobs_total` | counter | worker, outcome | Scraper / notifier job outcomes |
| `priceflux_job_duration_seconds` | histogram | worker, outcome | Job latency |
| `priceflux_alerts_total` | counter | outcome | Drop alerts / email channel outcomes |
| `priceflux_queue_messages` | gauge | queue | RabbitMQ ready depth (lag) |

Default Node process metrics (`process_*`, `nodejs_*`) are also registered.

### Scraper `outcome` values

`success` · `retry` · `dead` · `poison` · `publish_error`

### Notifier `outcome` values

`success` · `error`

### Alert `outcome` values (`priceflux_alerts_total`)

| outcome | Meaning |
|---------|---------|
| `emitted` | Full alert pipeline finished (after log → optional email → optional webhook) |
| `email_sent` | SMTP send succeeded |
| `email_failed` | SMTP send threw (job then nacks without requeue) |
| `email_skipped` | No recipient email on the alert |

Email setup: [EMAIL.md](EMAIL.md).

## Correlation ids

| Hop | Id |
|-----|----|
| HTTP → API | `x-request-id` (generated if missing; echoed on the response) |
| Scrape job → result → notify | `jobId` (UUID) is the cross-service correlation key; workers log `correlationId` |

Optional AMQP / future header: `x-correlation-id` (resolved preferentially by `@priceflux/observability`).

```bash
curl -s -D- -o /dev/null -H 'x-request-id: demo-123' http://127.0.0.1:3000/healthz
# expect: x-request-id: demo-123
```

## Example Prometheus scrape config

```yaml
scrape_configs:
  - job_name: priceflux-api
    static_configs:
      - targets: ['host.docker.internal:3000']
  - job_name: priceflux-scraper
    static_configs:
      - targets: ['host.docker.internal:9101']
  - job_name: priceflux-notifier
    static_configs:
      - targets: ['host.docker.internal:9102']
```

## “Dashboard” starter queries

Use these in Prometheus / Grafana Explore (no packaged dashboard JSON in v1):

```promql
# Request rate by route
sum by (route) (rate(priceflux_http_requests_total[5m]))

# Scrape success vs retry/dead
sum by (outcome) (rate(priceflux_jobs_total{worker="scraper"}[5m]))

# Queue lag (ready messages)
priceflux_queue_messages

# Alert emission rate
sum by (outcome) (rate(priceflux_alerts_total[5m]))

# API p95 latency
histogram_quantile(0.95, sum by (le, route) (rate(priceflux_http_request_duration_seconds_bucket[5m])))
```

## Local checklist

1. `pnpm topology:assert` and start API + workers  
2. `curl /metrics` on each process  
3. `POST /watches` once and confirm `priceflux_jobs_total` / queue gauges move  
4. Confirm `x-request-id` round-trips on `/healthz`

For prod alert ideas and scaling signals, see [PROD.md](PROD.md).

OpenTelemetry export is **not** wired in this stage; Prometheus text is the v1 baseline.
