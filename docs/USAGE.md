# Priceflux usage guide (through stage 14)

This document describes **what works today** after stages **01–14**, and how to run/test it locally.

> **Short answer:** Full pipeline works for pages with Schema.org JSON-LD: watch → scrape → `price_history` → drop alert (log / optional webhook).  
> **Real big-box sites (Amazon, etc.) usually still fail** until anti-bot (stage 16). Stage 14 does not improve scraping; it only persists successful results and alerts.

---

## What is completed (01–14)

| Stage | Capability |
|-------|------------|
| 01–09 | Monorepo, Compose, topology, contracts, mq/cache/db, API watches + enqueue |
| 10–12 | Scraper worker + JSON-LD extract + Playwright → `results.ready` |
| 13 | DLX retries + dead letter + `pnpm replay:dead` |
| 14 | Notifier: `price_history` + threshold alerts (log / webhook stub) |

### Still missing

| Later | Missing |
|-------|---------|
| 15 | Metrics / observability |
| 16 | Anti-bot (proxies, stealth) — needed for many live shops |
| — | Web UI (v2) |

---

## Realistic testing (read this)

| Scenario | Expectation after stage 14 |
|----------|----------------------------|
| Local HTML with Product JSON-LD (fixture / static server) | **Works end-to-end**: history row + alert if `price <= threshold` |
| Small/indie shop that exposes Schema.org Offer JSON-LD and allows headless Chromium | **May work** — try it; check worker logs / `scrape.dead` if not |
| Amazon, Walmart, most major retailers | **Usually will not work yet** — bot blocks / no usable JSON-LD. Failures retry then land on `scrape.dead`. Stage **16** is for that. |
| After 14, “can I check real websites?” | You can **point** real URLs at the API, but success depends on scrape (12/16), not on the notifier (14). |

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

```bash
pnpm --filter @priceflux/worker-notifier test
pnpm --filter @priceflux/worker-notifier test:integration   # needs Postgres + RabbitMQ
pnpm --filter @priceflux/worker-scraper test:integration
```

---

## Roadmap after 14

1. **15** — metrics / observability  
2. **16** — anti-bot baseline (realistically required for Amazon-class sites)
