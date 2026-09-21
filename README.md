# Priceflux

Distributed web scraper and price-tracking engine (API-first; UI deferred to v2).

## Stack

- **Language:** TypeScript / Node.js
- **API:** Fastify (`apps/api`)
- **Workers:** Playwright scrapers + notification consumer
- **Broker:** RabbitMQ
- **Data:** PostgreSQL + Redis

## Monorepo layout

```
apps/
  api/                 Fastify HTTP API
  worker-scraper/      Scraping workers
  worker-notifier/     Price alerts / history writer
packages/
  shared/              Shared types and Zod contracts
  mq/                  RabbitMQ helpers
  db/                  Postgres schema / migrations
  cache/               Redis helpers
  scrape-core/         Extraction (JSON-LD, etc.)
infra/                 Compose, RabbitMQ definitions (from PR 02+)
```

## Prerequisites

- Node.js ≥ 20
- pnpm 9 (`packageManager` field enforced via Corepack/pnpm)

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
```

## Delivery

Incremental PRs — see the architecture/delivery plan. This commit is **PR 01** (scaffold only). No business logic, Docker, or RabbitMQ topology yet.
