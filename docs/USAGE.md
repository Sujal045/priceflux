# Priceflux usage guide (through stage 10)

This document describes **what works today** after stages **01–10**, and how to run/test it locally.

> **Short answer:** You can submit a product URL via the API, persist a watch, enqueue a scrape job, and have the worker **ack** it.  
> You **cannot** yet scrape live prices, detect price drops, or get alerts. That starts at stages **11–14**.

---

## What is completed (01–10)

| Stage | Capability |
|-------|------------|
| 01 | TypeScript monorepo (pnpm / Turborepo) |
| 02 | Local Docker Compose: Postgres, Redis, RabbitMQ |
| 03 | RabbitMQ topology (work queue, retries, DLX, results) |
| 04 | Shared Zod contracts + URL canonicalization / dedupe keys |
| 05 | RabbitMQ client with publisher confirms |
| 06 | Redis URL dedupe (`SET NX EX` 5 minutes) + domain rate-limit stub |
| 07 | DB schema: `users`, `watches`, `price_history` + migrations |
| 08 | Fastify API with `GET /healthz` |
| 09 | Watches CRUD + enqueue `scrape.job` (with Redis dedupe) |
| 10 | Scraper worker consumes `scrape.jobs` and **acks** (noop handler) |

### What is **not** done yet

| Later stage | Missing capability |
|-------------|-------------------|
| 11 | JSON-LD / HTML price extraction |
| 12 | Playwright fetch → publish `results.ready` |
| 13 | Retry / DLX worker behavior for scrape failures |
| 14 | Write `price_history`, compare threshold, send alerts |
| — | Web UI (v2) |

So: **giving a URL to the API does not change or read a real product price today.**

---

## Prerequisites

- Node.js ≥ 20, pnpm 9
- Docker + Docker Compose
- Repo checked out; dependencies installed

```bash
cd ~/Projects/priceflux
cp -n .env.example .env
pnpm install
pnpm build
```

---

## 1. Start infrastructure

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d
docker compose -f infra/docker-compose.yml ps
```

All three services should be **healthy**:

| Service | Default host port | Notes |
|---------|-------------------|--------|
| Postgres | `5433` | Avoids clash with local Postgres on `5432` |
| Redis | `6379` | |
| RabbitMQ | `5672` (AMQP), `15672` (UI) | UI: http://localhost:15672 — user/pass from `.env` |

### Apply broker topology + DB migrations

```bash
pnpm topology:assert
pnpm db:migrate
```

- `topology:assert` — creates/verifies exchanges & queues from `infra/rabbitmq/definitions.json`
- `db:migrate` — creates `users`, `watches`, `price_history`

---

## 2. Run the API and scraper worker

Use **two terminals**.

**Terminal A — API**

```bash
pnpm dev:api
```

**Terminal B — scraper worker (skeleton)**

```bash
pnpm dev:worker-scraper
```

Health check:

```bash
curl -s http://127.0.0.1:3000/healthz
# {"status":"ok","service":"api"}
```

---

## 3. Use the Watches API

Base URL: `http://127.0.0.1:3000`  
Auth: none yet (pass `email` in the body/query as a stand-in user id).

### Create / upsert a watch (and maybe enqueue a scrape)

```bash
curl -s -X POST http://127.0.0.1:3000/watches \
  -H 'content-type: application/json' \
  -d '{
    "email": "you@example.com",
    "url": "https://shop.example/product/123?utm_source=test",
    "threshold": 20,
    "currency": "USD"
  }' | jq
```

Typical first response:

```json
{
  "watch": { "id": "...", "canonicalUrl": "https://shop.example/product/123", "...": "..." },
  "created": true,
  "scrapeQueued": true,
  "jobId": "..."
}
```

What happens:

1. URL is **canonicalized** (tracking params stripped, etc.)
2. User row is created/found by email
3. Watch is inserted/updated in Postgres
4. Redis tries to claim `dedupeKey` for **5 minutes**
5. If claimed → publish `scrape.job` to RabbitMQ → worker receives it and **acks** (no price scrape yet)
6. If not claimed (same URL within 5 minutes) → `scrapeQueued: false` + `dedupeTtlSeconds`

Second POST within 5 minutes for the same canonical URL:

```json
{
  "created": false,
  "scrapeQueued": false,
  "dedupeTtlSeconds": 280
}
```

### List watches for an email

```bash
curl -s 'http://127.0.0.1:3000/watches?email=you@example.com' | jq
```

### Get one watch

```bash
curl -s "http://127.0.0.1:3000/watches/<WATCH_ID>" | jq
```

### Update threshold / currency / active

```bash
curl -s -X PATCH "http://127.0.0.1:3000/watches/<WATCH_ID>" \
  -H 'content-type: application/json' \
  -d '{"threshold": 15.5, "currency": "USD"}' | jq
```

### Soft-delete (deactivate)

```bash
curl -s -X DELETE "http://127.0.0.1:3000/watches/<WATCH_ID>" | jq
# watch.active === false
```

---

## 4. What you should see when testing end-to-end (today)

| Step | Expected result |
|------|-----------------|
| `POST /watches` | Watch saved in DB; often `scrapeQueued: true` |
| Worker logs | Message like `scrape job acknowledged (skeleton)` |
| RabbitMQ UI → `scrape.jobs` | Message consumed (depth back to 0) |
| `price_history` table | **Still empty** — nothing writes prices yet |
| Real shop price | **Not fetched** |

### Inspect data (optional)

```bash
# Watches in Postgres
docker exec -it priceflux-postgres \
  psql -U priceflux -d priceflux -c 'SELECT id, canonical_url, threshold, active FROM watches;'

# Price history (expect 0 rows until stage 14)
docker exec -it priceflux-postgres \
  psql -U priceflux -d priceflux -c 'SELECT count(*) FROM price_history;'
```

RabbitMQ management UI: http://localhost:15672 → Queues → `scrape.jobs`.

---

## 5. Automated tests (optional)

With Compose up, topology applied, and migrations run:

```bash
pnpm --filter @priceflux/shared test
pnpm --filter @priceflux/mq test:integration
pnpm --filter @priceflux/cache test:integration
pnpm --filter @priceflux/db test:integration
pnpm --filter @priceflux/api test
pnpm --filter @priceflux/api test:integration
pnpm --filter @priceflux/worker-scraper test
pnpm --filter @priceflux/worker-scraper test:integration
pnpm lint
```

---

## 6. Stop local stack

```bash
# Ctrl+C API and worker terminals

docker compose -f infra/docker-compose.yml down
# Destructive reset (wipes volumes):
# docker compose -f infra/docker-compose.yml down -v
```

---

## 7. JSON-LD extractor (stage 11)

`@priceflux/scrape-core` can parse Schema.org **Product / Offer** prices from HTML fixtures (no browser, no live URLs yet):

```bash
pnpm --filter @priceflux/scrape-core test
```

Example (from app or REPL after build):

```ts
import { extractPriceFromHtml } from '@priceflux/scrape-core';

const result = extractPriceFromHtml(htmlString);
// { ok: true, data: { price, currency, title?, source: 'json_ld' } }
// or { ok: false, reason: 'no_json_ld' | 'no_product' | 'no_price' | 'invalid_price' }
```

Fixtures live under `packages/scrape-core/fixtures/`.

---

## Roadmap after stage 11

1. **12** — Playwright loads URL → extract → publish result  
2. **13** — retries / dead letter for failed scrapes  
3. **14** — store price history + alert when below threshold  

Until stage 12+, submitting a URL via the API still does **not** fetch a live price.
