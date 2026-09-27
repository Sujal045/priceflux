# Priceflux usage guide (through stage 16)

This document describes **what works today** after stages **01–16**, and how to run/test it locally.

> **Short answer:** Full pipeline works for JSON-LD fixtures. Optional anti-bot flags (stealth / proxy / domain rate limits) are **off or mild by default**. Amazon-class sites may still fail.

---

## What is completed (01–16)

| Stage | Capability |
|-------|------------|
| 01–09 | Monorepo, Compose, topology, contracts, mq/cache/db, API watches + enqueue |
| 10–12 | Scraper worker + JSON-LD extract + Playwright → `results.ready` |
| 13 | DLX retries + dead letter + `pnpm replay:dead` |
| 14 | Notifier: `price_history` + threshold alerts |
| 15 | Prometheus metrics + correlation ids |
| 16 | Feature-flagged stealth (Patchright), proxy URL, Redis domain rate limits |

### Still missing

| Later | Missing |
|-------|---------|
| 17 | Prod hardening docs (quorum, HPA, runbooks) |
| — | Web UI (v2) |

Anti-bot details: [ANTIBOT.md](ANTIBOT.md) · Metrics: [OBSERVABILITY.md](OBSERVABILITY.md).

---

## Realistic testing (read this)

| Scenario | Expectation after stage 14 |
|----------|----------------------------|
| Local HTML with Product JSON-LD (fixture / static server) | **Works end-to-end**: history row + alert if `price <= threshold` |
| Small/indie shop that exposes Schema.org Offer JSON-LD and allows headless Chromium | **May work** — try it; check worker logs / `scrape.dead` if not |
| Amazon, Walmart, most major retailers | **Often still fails** — try `SCRAPER_STEALTH=true` + residential `SCRAPER_PROXY_URL`; no guarantees |
| After 16, “can I check real websites?” | Better odds with stealth/proxy, but not reliable for hard bot walls |

**Best local demo:** serve `packages/scrape-core/fixtures/product-simple.html` (price `29.99` USD), create a watch with `threshold: 30`, run API + scraper + notifier.

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

---

## Run the three processes

```bash
pnpm dev:api                 # terminal A
pnpm dev:worker-scraper      # terminal B
pnpm dev:worker-notifier     # terminal C
```

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

---

## Automated tests

Integration tests share the same RabbitMQ queues as local workers. **Stop**
`pnpm dev:worker-scraper` and `pnpm dev:worker-notifier` first — otherwise those
processes steal messages and tests time out or see the wrong `x-error-class`.

```bash
pnpm --filter @priceflux/worker-notifier test
pnpm --filter @priceflux/worker-notifier test:integration   # needs Postgres + RabbitMQ
pnpm --filter @priceflux/worker-scraper test:integration    # needs broker + Chromium
```

---

## Roadmap after 16

1. **17** — prod hardening docs (quorum queues, HPA, dead-letter runbooks)
