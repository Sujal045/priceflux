# Scheduled re-scrape (stage 19)

The **scheduler worker** periodically enqueues scrapes for **active** watches whose
last check is older than `SCHEDULER_WATCH_INTERVAL_SECONDS`. You no longer need
to call `POST /watches` again just to refresh a price.

Initial scrape still happens on watch create (API). The scheduler handles **re-checks**.

## Process

```text
worker-scheduler (every SCHEDULER_POLL_INTERVAL_SECONDS)
  → load active watches
  → compare last price_history.scraped_at (or watch.created_at if never scraped)
  → if due → tryEnqueueWatchScrape (same Redis URL dedupe as API)
  → scrape.jobs → scraper → notifier → email if threshold met
```

## Run locally

```bash
# terminal D (alongside API + scraper + notifier)
pnpm dev:worker-scheduler
```

Env (see `.env.example`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `SCHEDULER_POLL_INTERVAL_SECONDS` | `300` | How often the scheduler scans watches |
| `SCHEDULER_WATCH_INTERVAL_SECONDS` | `3600` | Min time between scrapes per watch |
| `WORKER_SCHEDULER_METRICS_PORT` | `9103` | Prometheus metrics (`0` = off) |

**Local demo tip:** for faster feedback, set e.g. `SCHEDULER_WATCH_INTERVAL_SECONDS=300` and `SCHEDULER_POLL_INTERVAL_SECONDS=60` in `.env`.

## Dedupe interaction

- **Watch interval** (`SCHEDULER_WATCH_INTERVAL_SECONDS`): DB-driven “is this watch due?”
- **URL dedupe** (Redis, 5 minutes): “may we publish another job for this URL right now?”

If the scheduler finds a watch due but Redis dedupe is still held (e.g. manual `POST /watches` just ran), the tick **skips** with `skipped_dedupe` — no error.

## Metrics

On `:9103/metrics` (when enabled):

| `priceflux_jobs_total` outcome | Meaning |
|-------------------------------|---------|
| `enqueued` | Scrape jobs published this tick |
| `skipped_dedupe` | Due but Redis dedupe blocked |
| `enqueue_error` | Publish/claim failed for one watch |
| `success` / `partial` / `error` | Whole tick result |

## Tests

```bash
pnpm --filter @priceflux/worker-scheduler test
pnpm --filter @priceflux/worker-scheduler test:integration   # Postgres + Redis + RabbitMQ
```

Stop `pnpm dev:worker-scraper` before integration tests if the queue consumer count matters.

## Prod notes

- Run **one** scheduler replica (or leader-elected) — multiple schedulers duplicate scan work; dedupe limits duplicate jobs but wastes effort.
- Scale **scraper** workers for throughput, not the scheduler.
- See [PROD.md](PROD.md) for broker HA and scaling.
