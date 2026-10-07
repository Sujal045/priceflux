# Priceflux usage guide (through stage 20)

This document describes **what works today** after stages **01–20**, and how to run/test it locally.

> **Short answer:** Full pipeline works for JSON-LD fixtures, including optional **email**, **scheduled re-scrape**, and a **browser Web UI**. Anti-bot flags stay off by default. **Prod ops** in [PROD.md](PROD.md).

---

## What is completed (01–20)

| Stage | Capability |
|-------|------------|
| 01–09 | Monorepo, Compose, topology, contracts, mq/cache/db, API watches + enqueue |
| 10–12 | Scraper worker + JSON-LD extract + Playwright → `results.ready` |
| 13 | DLX retries + dead letter + `pnpm replay:dead` |
| 14 | Notifier: `price_history` + threshold alerts (log + optional webhook) |
| 15 | Prometheus metrics + correlation ids |
| 16 | Feature-flagged stealth (Patchright), proxy URL, Redis domain rate limits |
| 17 | SMTP email drop alerts + local Mailpit inbox |
| 18 | Prod hardening **docs** (quorum / HPA / DLX runbooks) |
| 19 | **Scheduler worker** — periodic re-scrape for active watches |
| 20 | **Web UI** — Vite + React watches console |

### Still missing / backlog

| Item | Notes |
|------|-------|
| ProductGroup / hasVariant JSON-LD | Variant pages |

Anti-bot: [ANTIBOT.md](ANTIBOT.md) · Scheduler: [SCHEDULER.md](SCHEDULER.md) · Web: [WEB.md](WEB.md) · Metrics: [OBSERVABILITY.md](OBSERVABILITY.md) · Email: [EMAIL.md](EMAIL.md) · Prod: [PROD.md](PROD.md).

---

## Realistic testing (read this)

| Scenario | Expectation after stage 17+ |
|----------|----------------------------|
| Local HTML with Product JSON-LD (fixture / static server) | **Works end-to-end**: history row + alert if `price <= threshold` |
| Same + Mailpit SMTP env | **Email** appears in `http://127.0.0.1:8025` |
| SMTP env unset | Log ± webhook only (no email) |
| Small/indie shop with Schema.org Offer JSON-LD | **May work** — try it; check worker logs / `scrape.dead` if not |
| Amazon, Walmart, most major retailers | **Often still fails** — try stealth/proxy; no guarantees |

**Best local demo:** serve `packages/scrape-core/fixtures/product-simple.html` (price `29.99` USD), create a watch with `threshold: 30`, run API + scraper + notifier (and Mailpit if testing email).

---

## Prerequisites

```bash
cd ~/Projects/priceflux
cp -n .env.example .env
pnpm install
pnpm --filter @priceflux/worker-scraper playwright:install
pnpm build
docker compose -f infra/docker-compose.yml --env-file .env up -d
pnpm topology:assert
pnpm db:migrate
```

For email locally, uncomment `NOTIFIER_SMTP_*` in `.env` (see [EMAIL.md](EMAIL.md)). Mailpit UI: `http://127.0.0.1:8025`.

---

## Run the processes

```bash
pnpm dev:api                 # terminal A
pnpm dev:worker-scraper      # terminal B
pnpm dev:worker-notifier     # terminal C
pnpm dev:worker-scheduler    # terminal D — periodic re-scrape (stage 19)
pnpm dev:web                 # terminal E — Web UI at http://127.0.0.1:5173
```

Watches are scraped once on create (`POST /watches`) and again when the scheduler
finds them due (default: every hour per watch). See [SCHEDULER.md](SCHEDULER.md)
and [WEB.md](WEB.md).

### Create a watch

```bash
curl -s -X POST http://127.0.0.1:3000/watches \
  -H 'content-type: application/json' \
  -d '{
    "email": "you@example.com",
    "url": "http://127.0.0.1:PORT/product-simple.html",
    "threshold": 30,
    "currency": "USD"
  }' | jq
```

### What success looks like

| Check | Expect |
|-------|--------|
| Scraper logs | `scrape result published` |
| Notifier logs | `scrape result handled` with `inserted: true`; `price drop alert` if price ≤ threshold |
| Postgres | Row in `price_history` |
| Optional webhook | Set `NOTIFIER_WEBHOOK_URL` in `.env` for POST JSON stub |
| Optional email | Set `NOTIFIER_SMTP_HOST`; message in Mailpit UI |

```bash
docker exec -it priceflux-postgres \
  psql -U priceflux -d priceflux \
  -c 'SELECT job_id, price, currency, title FROM price_history ORDER BY created_at DESC LIMIT 5;'
```

### Failure / retries

Bad URLs or blocked sites → scraper retries (`scrape.retry.*`) then `scrape.dead`. Replay:

```bash
pnpm replay:dead -- --limit 5
```

Full ops detail: [PROD.md](PROD.md#dlx--dead-letter-runbook).

---

## Automated tests

Integration tests share the same RabbitMQ queues as local workers. **Stop**
`pnpm dev:worker-scraper` and `pnpm dev:worker-notifier` first — otherwise those
processes steal messages and tests time out or see the wrong `x-error-class`.

```bash
pnpm --filter @priceflux/worker-notifier test
pnpm --filter @priceflux/worker-notifier test:integration   # needs Postgres + RabbitMQ
pnpm --filter @priceflux/worker-notifier test:mailpit       # needs Mailpit + SMTP env
pnpm --filter @priceflux/worker-scraper test:integration    # needs broker + Chromium
```

---

## Roadmap after 20

1. **Backlog** — `ProductGroup` / `hasVariant` JSON-LD (Odoo variant pages)

Stage briefs live in [DELIVERY.md](DELIVERY.md).
