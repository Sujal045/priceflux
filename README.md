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
infra/                 Docker Compose (Postgres, Redis, RabbitMQ)
```

## Prerequisites

- Node.js ≥ 20
- pnpm 9 (`packageManager` field enforced via Corepack/pnpm)
- Docker + Docker Compose (for local infra)

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
```

## Local infrastructure

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml --env-file .env up -d
docker compose -f infra/docker-compose.yml ps
```

See [infra/README.md](infra/README.md) for ports and teardown. RabbitMQ topology (exchanges/queues) lands in a later PR.

## Delivery

Incremental PRs into `main`. Current focus: local Compose stack only — no app business logic yet.
