# Priceflux usage guide (through stage 13)

This document describes **what works today** after stages **01–13**, and how to run/test it locally.

> **Short answer:** You can submit a product URL via the API, have the worker scrape JSON-LD prices, and publish `results.ready`. Failed scrapes are **classified**, retried on TTL queues (`30s` → `5m` → `30m`), then parked on `scrape.dead`.  
> You **cannot** yet write price history or send drop alerts. That is stage **14**.

---

## What is completed (01–13)

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
| 10 | Scraper worker consumes `scrape.jobs` with manual ack |
| 11 | `@priceflux/scrape-core` JSON-LD Product/Offer extractor |
| 12 | Playwright fetch → extract → publish `results.ready` |
| 13 | Error classes, attempt headers, DLX retry tiers, dead-letter replay |

### What is **not** done yet

| Later stage | Missing capability |
|-------------|-------------------|
| 14 | Write `price_history`, compare threshold, send alerts |
| — | Web UI (v2) |

So: **scrape successes land on `results.notify`; failures retry then park on `scrape.dead`.** Nothing yet stores history or alerts you.

---

## Prerequisites

- Node.js ≥ 20, pnpm 9
- Docker + Docker Compose
- Chromium for Playwright (one-time install)
- Repo checked out; dependencies installed

```bash
cd ~/Projects/priceflux
cp -n .env.example .env
pnpm install
pnpm --filter @priceflux/worker-scraper playwright:install
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

---

## 2. Run the API and scraper worker

Use **two terminals**.

**Terminal A — API**

```bash
pnpm dev:api
```

**Terminal B — scraper worker**

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
5. If claimed → publish `scrape.job` → worker scrapes
6. Success → `results.ready` on `results.notify`
7. Failure → publish to `scrape.dlx` retry tier (or `scrape.dead`), then ack

> **Note:** Many live shops block headless browsers or omit JSON-LD. Prefer a page with Schema.org Product JSON-LD (see `packages/scrape-core/fixtures/`). Anti-bot work is stage 16.

### List / get / update / delete

Same as before — `GET /watches?email=...`, `GET|PATCH|DELETE /watches/:id`.

---

## 4. Retries and dead letter (stage 13)

On scrape failure the worker:

1. Classifies the error (`timeout`, `http_403`, `http_429`, `captcha`, `parse`, `proxy`, `unknown`)
2. Increments `x-attempt` and sets `x-error-class` / `x-first-failure-at`
3. Publishes to `scrape.dlx` with confirms, then acks the original job

| Failed attempt → next | Route |
|-----------------------|--------|
| 1 → 2 | `scrape.retry.30s` |
| 2 → 3 | `scrape.retry.5m` |
| 3 → 4 | `scrape.retry.30m` |
| exhausted / ≥ max | `scrape.dead` |

`http_403` and `captcha` skip short tiers and jump to `scrape.retry.30m` when retries remain. Poison payloads (invalid JSON/schema) still **nack without requeue** → `scrape.fail` → `scrape.dead`.

### Replay dead letters

```bash
pnpm replay:dead -- --dry-run          # peek first message
pnpm replay:dead -- --limit 10         # republish up to 10 jobs to scrape.jobs
pnpm replay:dead                       # replay all currently on scrape.dead
```

Replay resets `x-attempt` to `1` for a fresh budget.

---

## 5. What you should see when testing end-to-end (today)

| Step | Expected result |
|------|-----------------|
| `POST /watches` | Watch saved; often `scrapeQueued: true` |
| Success | Worker logs `scrape result published`; message on `results.notify` |
| Transient failure | Message on `scrape.retry.*`, then back on `scrape.jobs` after TTL |
| Exhausted failures | Message on `scrape.dead` with `x-error-class` |
| `price_history` | **Still empty** — notifier is stage 14 |
| Alerts | **Not sent** |

RabbitMQ management UI: http://localhost:15672 → Queues.

---

## 6. Automated tests (optional)

```bash
pnpm --filter @priceflux/shared test
pnpm --filter @priceflux/mq test:integration
pnpm --filter @priceflux/cache test:integration
pnpm --filter @priceflux/db test:integration
pnpm --filter @priceflux/api test
pnpm --filter @priceflux/api test:integration
pnpm --filter @priceflux/scrape-core test
pnpm --filter @priceflux/worker-scraper test
pnpm --filter @priceflux/worker-scraper test:integration
pnpm lint
```

Worker integration covers success → `results.notify`, failure → `scrape.retry.30s`, and exhausted attempts → `scrape.dead`.

---

## 7. Stop local stack

```bash
# Ctrl+C API and worker terminals

docker compose -f infra/docker-compose.yml down
# Destructive reset (wipes volumes):
# docker compose -f infra/docker-compose.yml down -v
```

---

## Roadmap after stage 13

1. **14** — store price history + alert when below threshold  

Until stage 14, `results.ready` messages sit on `results.notify` with no consumer writing history or sending alerts.
