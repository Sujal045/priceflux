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
pnpm topology:assert
```

See [infra/README.md](infra/README.md) for ports, topology, and teardown.

## Debugging (VS Code / Cursor)

Use **Run and Debug** (`F5`) with the configs in `.vscode/launch.json`:

| Config | Use |
|--------|-----|
| Debug current TS file | Open any `.ts` file, then start |
| API / Worker:* | Run app entrypoints under the debugger |
| Test: @priceflux/shared \| mq \| cache | Breakpoints in package tests |
| Test: @priceflux/mq \| cache (integration) | Needs Compose (Redis/RabbitMQ) |
| Script: topology assert | Debug the topology apply/assert script |
| Attach to Node process | Process started with `--inspect=9229` |

Workspace setting `debug.javascript.autoAttachFilter` is **`onlyWithFlag`** (not `smart`/`always`). That avoids a known js-debug bootloader clash with `node --test` (`Environment was initialized without a V8::Inspector`). For terminal auto-attach, start Node with `--inspect` yourself.

## Delivery

Incremental PRs into `main`. Track progress in [docs/DELIVERY.md](docs/DELIVERY.md). Cursor project rules in `.cursor/rules/` encode the workflow for every chat.
