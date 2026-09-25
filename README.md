# Priceflux

Distributed web scraper and price-tracking engine (API-first; UI deferred to v2).

**How far are we?** Stages **01–12** are on `main`. Stage **13** (this branch / upcoming PR) adds DLX retries + dead letter. **Drop alerts and price history writes are not available yet** (stage 14).

**Operator guide:** see [docs/USAGE.md](docs/USAGE.md) for setup, API examples, and what you can / cannot test today.

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
pnpm db:migrate
```

### API (local)

```bash
pnpm topology:assert
pnpm db:migrate
pnpm dev:api
curl -s http://127.0.0.1:3000/healthz
curl -s -X POST http://127.0.0.1:3000/watches \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","url":"https://shop.example/p/1","threshold":20,"currency":"USD"}'
```

### Scraper worker

```bash
pnpm --filter @priceflux/worker-scraper playwright:install
pnpm topology:assert
pnpm dev:worker-scraper
# In another terminal, POST /watches (or publish a scrape job).
# On success the worker publishes results.ready (see results.notify in RabbitMQ UI).
```

See [infra/README.md](infra/README.md) for ports, topology, and teardown.

## Debugging (VS Code / Cursor)

Use **Run and Debug** (`F5`) with the configs in `.vscode/launch.json`:

| Config | Use |
|--------|-----|
| Debug current TS file | Open any `.ts` file, then start |
| API / Worker:* | Run app entrypoints under the debugger |
| Test: @priceflux/shared \| mq \| cache \| db | Breakpoints in package tests |
| Test: * (integration) | Needs Compose services up |
| DB: migrate | Run Drizzle migrations under the debugger |
| Script: topology assert | Debug the topology apply/assert script |
| Attach to Node process | Process started with `--inspect=9229` |

Workspace setting `debug.javascript.autoAttachFilter` is **`onlyWithFlag`** (not `smart`/`always`). That avoids a known js-debug bootloader clash with `node --test` (`Environment was initialized without a V8::Inspector`). For terminal auto-attach, start Node with `--inspect` yourself.

## Delivery

Incremental PRs into `main`. Track progress in [docs/DELIVERY.md](docs/DELIVERY.md).  
Day-to-day usage: [docs/USAGE.md](docs/USAGE.md).  
Cursor project rules in `.cursor/rules/` encode the workflow for every chat. Agent entrypoint: [AGENTS.md](AGENTS.md).
