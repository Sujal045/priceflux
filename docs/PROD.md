# Production hardening (stage 18)

Operator guidance for running Priceflux beyond local Compose.  
**This stage is documentation only** — local `infra/rabbitmq/definitions.json` stays classic durable queues for easy `docker compose` resets. Apply quorum / HA changes in your **prod** broker (or a follow-up infra PR).

Related: [USAGE.md](USAGE.md) · [OBSERVABILITY.md](OBSERVABILITY.md) · [EMAIL.md](EMAIL.md) · [ANTIBOT.md](ANTIBOT.md) · [infra/README.md](../infra/README.md)

---

## What “prod ready enough” means for v1

| Area | Local today | Prod recommendation |
|------|-------------|---------------------|
| RabbitMQ queues | Classic durable | Prefer **quorum** for work + dead (+ notify) |
| Broker | Single Compose node | Clustered RabbitMQ (odd number of nodes) |
| Postgres / Redis | Single containers | Managed HA (primary + replica / Redis Sentinel or vendor HA) |
| API / workers | `pnpm dev:*` | Containers or VMs; scale scrapers carefully |
| Secrets | `.env` file | Secret manager / injected env; never bake into images |
| Metrics | Prometheus text on `:3000` / `:9101` / `:9102` | Scrape + alert on lag / dead depth / error rate |
| Email | Optional Mailpit / SMTP | Real SMTP; monitor `email_failed` |

v1 includes a **scheduler worker** (stage 19) that re-enqueues active watches on
`SCHEDULER_WATCH_INTERVAL_SECONDS`. Run **one** scheduler replica; scale scrapers
for throughput. See [SCHEDULER.md](SCHEDULER.md).

---

## Quorum queues

### Why

Classic queues on one broker node lose unconsumed messages if that node dies hard (even if durable, without mirroring). **Quorum queues** replicate across the RabbitMQ cluster and are the current HA path (classic mirroring is legacy).

### What to convert first

| Queue | Priority | Notes |
|-------|----------|--------|
| `scrape.jobs` | High | Main work queue |
| `scrape.dead` | High | Parking lot must survive broker blips |
| `results.notify` | High | Dropped notifies = missed history/alerts |
| `scrape.retry.30s` / `5m` / `30m` | Medium | TTL DLX delay queues; convert with care (see below) |

Exchanges stay topic/durable; only **queue type** changes.

### How (ops outline — do not apply blindly to local)

1. Stand up a RabbitMQ **cluster** (3 nodes typical).
2. Declare replacement queues with `"x-queue-type": "quorum"` (same names only after draining/deleting classics, or use a cutover naming scheme).
3. Re-bind exchanges → new queues with the same routing keys as [`definitions.json`](../infra/rabbitmq/definitions.json).
4. Redeploy publishers/consumers (no app code change if names/bindings match).
5. Keep `pnpm topology:assert` / a prod assert job in CI against the **prod** definitions.

**In-place type change is not supported.** Migrating classic → quorum usually means: drain consumers → delete classic queue → declare quorum → restore bindings (or dual-publish during cutover). Treat as a maintenance window.

### TTL retry queues + quorum

Retry tiers use **queue TTL** (`x-message-ttl`) then DLX back to `scrape.work` / `scrape.job`. Quorum supports queue TTL, but:

- Prefer **queue-level** TTL (as today) over per-message TTL quirks.
- After cutover, verify one failed scrape lands in `scrape.retry.30s` and returns to `scrape.jobs` after ~30s.
- Confirm publisher confirms still succeed (`@priceflux/mq`).

### Local vs prod definitions

Keep Compose on classic queues for fast `down -v` resets. Maintain a separate prod definitions file or IaC module when you adopt quorum — do not silently break local assert scripts.

---

## Scaling (HPA / replicas)

Priceflux is three process types. Scale them independently.

### API (`apps/api`)

- **Stateless** aside from DB/Redis/Rabbit connections.
- HPA on CPU and/or request rate is fine.
- Watch Postgres connection count (`max_connections` vs pool size × replicas).
- Enqueue path uses Redis URL dedupe (5 minutes) — safe under concurrent creates.

### Scraper (`apps/worker-scraper`)

- Each replica runs **Chromium** — memory/CPU heavy; size nodes accordingly.
- Competing consumers on `scrape.jobs` are expected; set `WORKER_SCRAPER_PREFETCH` low (e.g. `1`–`5`) so one pod does not hoard jobs.
- Domain rate limits (Redis) are **shared** across replicas — good; raising replica count does not bypass per-domain caps.
- Stealth/proxy (`SCRAPER_*`) must be identical (or intentionally varied) across the Deployment.
- HPA signals that work well: `priceflux_queue_messages{queue="scrape.jobs"}` lag, CPU (with headroom for Chromium).

### Notifier (`apps/worker-notifier`)

- Lighter than scraper; scale on `results.notify` depth and DB write latency.
- Prefetch: `WORKER_NOTIFIER_PREFETCH` (default `10`).
- **Idempotency:** `price_history.job_id` unique — safe with multiple notifiers.
- Email/SMTP: external rate limits may cap useful parallelism; watch `email_failed`.

### What not to do

- Do not point **integration tests** at a prod/shared broker while workers are consuming (tests require `consumerCount == 0` on some queues).
- Do not run unbounded scraper HPA without memory limits — OOM kills mid-page are expensive retries.
- Do not share one Playwright browser profile/session store across pods unless you designed for it (v1 does not).

### Example mental model (Kubernetes)

```text
Deployment/api          → HPA: CPU / RPS
Deployment/scraper      → HPA: scrape.jobs depth + CPU; high memory requests
Deployment/notifier     → HPA: results.notify depth
```

Exact YAML is environment-specific; keep resource requests ≥ one Chromium footprint for scrapers.

---

## DLX / dead-letter runbook

### Happy failure path

1. Scraper fails → classifies error (`x-error-class`).
2. Publishes to `scrape.dlx` with confirms (retry key or `scrape.dead`), then **acks** the original `scrape.jobs` message.
3. Retry queues hold with TTL → DLX back to `scrape.work` / `scrape.job` with incremented `x-attempt`.
4. After `x-max-attempts` (default 4) → `scrape.dead`.

| Next attempt | Queue | Delay |
|--------------|-------|-------|
| 2 | `scrape.retry.30s` | 30s |
| 3 | `scrape.retry.5m` | 5m |
| 4 | `scrape.retry.30m` | 30m |
| exhausted | `scrape.dead` | — |

`captcha` / `http_403` jump to the **30m** tier early (see `planScrapeFailureRoute`).

Broker-level nack on `scrape.jobs` without an explicit publish uses DLX routing key `scrape.fail` → also bound to `scrape.dead` (unexpected / poison path).

### Inspect dead letters

Management UI: queue `scrape.dead` (message rates, get messages).  
Or metrics: `priceflux_queue_messages{queue="scrape.dead"}` and scraper `priceflux_jobs_total{outcome="dead"}`.

Useful headers on parked jobs: `x-attempt`, `x-max-attempts`, `x-error-class`, `x-first-failure-at`, `x-dedupe-key`.

### Replay

After fixing root cause (site up, proxy fixed, selector/fixture OK):

```bash
pnpm replay:dead -- --dry-run --limit 5   # parse-check only
pnpm replay:dead -- --limit 5             # republish to scrape.work with fresh attempt budget
```

Replay **resets** `x-attempt` to 1 and clears error headers so the job gets a full retry budget. Poison / unparseable payloads are skipped (acked off dead so the loop can continue — see script logs).

### When not to replay

- Large captcha / 403 storms until anti-bot / proxy is fixed ([ANTIBOT.md](ANTIBOT.md)).
- Known permanent `parse` failures (no JSON-LD) — fix extractor or drop the watch.
- Blind full-queue replay that thunders the same blocked host.

### Notifier / email failures

Notifier **nacks without requeue** on handler errors. History insert happens **before** alerts; SMTP failure does **not** auto-retry that `jobId` (see [EMAIL.md](EMAIL.md)). Ops: fix SMTP, then enqueue a **new** scrape (new `jobId`) if the user must be mailed.

---

## Secrets and config checklist

- [ ] `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL` from secret store  
- [ ] `NOTIFIER_SMTP_PASS` (and webhook URLs) not in git / image layers  
- [ ] `SCRAPER_PROXY_URL` credentials rotated independently  
- [ ] Management UI not public without auth / network policy  
- [ ] Mailpit **not** deployed to prod (local catcher only)

---

## Observability alerts (starter)

Wire these on top of [OBSERVABILITY.md](OBSERVABILITY.md):

| Signal | Suggest |
|--------|---------|
| `priceflux_queue_messages{queue="scrape.jobs"}` high for N minutes | Scale scrapers or investigate site blocks |
| `priceflux_queue_messages{queue="scrape.dead"}` rising | Page on-call; classify before replay |
| `rate(priceflux_jobs_total{worker="scraper",outcome="dead"}[5m])` | Same |
| `rate(priceflux_alerts_total{outcome="email_failed"}[5m])` | SMTP outage |
| API 5xx / p95 latency | DB or broker saturation |

---

## Acceptance (stage 18)

- [x] Quorum migration guidance documented (without breaking local classic topology).
- [x] HPA / replica guidance for API, scraper, notifier.
- [x] DLX + `scrape.dead` + `replay:dead` runbook.
- [x] `docs/DELIVERY.md` / USAGE / README point at prod docs; next work is backlog.
