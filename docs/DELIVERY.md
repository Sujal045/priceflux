# Priceflux delivery tracker

Source of truth for **what is done** and **what is next**.  
Agents and humans must update this file when a PR is merged or a stage starts.

Last updated: 2026-10-06

## Current WIP (read this first in a new chat)

**Stage 20** on branch `feat/20-web-ui` — v2 Web UI (Vite + React) for watches.

Code ready for user commit / PR. **Do not start further backlog** until this merges and the user asks.

## Workflow

- Default branch: `main`
- Merge path: feature branch → PR → `main` only
- Agent does **not** commit/push unless the user explicitly asks
- User commits with personal GitHub account (`Sujal045/priceflux`)
- After each stage, handoff includes **commit message** and **PR title/body**

## Stages

| # | Stage | Branch | Status | Notes |
|---|--------|--------|--------|-------|
| 01 | Monorepo scaffold | `feat/01-monorepo-scaffold` | **done** | Merged to `main` |
| 02 | Compose stack (Postgres/Redis/RabbitMQ) | `feat/02-compose-stack` | **done** | Merged via PR #1 |
| 03 | RabbitMQ topology + assert script | `feat/03-rabbitmq-topology` | **done** | Merged via PR #2 |
| 04 | `packages/shared` job/result contracts | `feat/04-shared-contracts` | **done** | Merged via PR #3 |
| 05 | `packages/mq` client + confirms | `feat/05-mq-client` | **done** | Merged via PR #4 |
| 06 | `packages/cache` Redis dedupe | `feat/06-cache-dedupe` | **done** | Merged via PR #5 |
| 07 | `packages/db` schema + migrations | `feat/07-db-schema` | **done** | Merged via PR #6 |
| 08 | Fastify API skeleton (`/healthz`) | `feat/08-api-skeleton` | **done** | Merged via PR #7 |
| 09 | Watches API + enqueue | `feat/09-watches-enqueue` | **done** | Merged via PR #8 |
| 10 | Scraper worker consumer skeleton | `feat/10-worker-skeleton` | **done** | Merged via PR #9 |
| 11 | `scrape-core` JSON-LD extractor | `feat/11-jsonld-extractor` | **done** | Merged via PR #10 |
| 12 | Playwright happy path → results | `feat/12-scrape-happy-path` | **done** | Merged via PR #11 |
| 13 | DLX retries + dead letter | `feat/13-dlx-retries` | **done** | Merged via PR #12 |
| 14 | Notifier + price history | `feat/14-notifier` | **done** | Merged via PR #13 |
| 15 | Observability baseline | `feat/15-observability` | **done** | Merged via PR #14 |
| 16 | Anti-bot baseline (flagged) | `feat/16-antibot` | **done** | Merged via PR #15–#17 |
| 17 | Email drop alerts | `feat/17-email-alerts` | **done** | Merged via PR #18 |
| 18 | Prod hardening docs | `feat/18-prod-docs` | **done** | Merged via PR #19 |
| 19 | Scheduled re-scrape | `feat/19-scheduled-rescrape` | **done** | Merged via PR #20 |
| 20 | Web UI (v2) | `feat/20-web-ui` | **in progress** | Vite React watches UI + API CORS |
| — | ProductGroup / hasVariant JSON-LD | — | **backlog** | Separate small PR |

## Next

1. User commits + opens **PR 20** (`feat/20-web-ui` → `main`).
2. After merge: backlog (ProductGroup) when the user asks.

---

## Stage 20 brief — Web UI

**Goal:** Browser UI to create/list/recheck/deactivate watches against the existing API.

### In scope

- `apps/web`: Vite + React + TypeScript
- Load watches by email, create watch, recheck (`POST /watches`), deactivate
- API CORS via `API_CORS_ORIGINS` (local Vite defaults)
- `docs/WEB.md`; update DELIVERY / USAGE / README

### Out of scope

- Real auth, charts, ProductGroup extractor
- Dedicated `POST /watches/:id/check` (reuse create enqueue)

### Acceptance checklist

- [x] `pnpm dev:web` serves UI that talks to API with CORS
- [x] Create / list / recheck / deactivate work against live API contracts
- [x] Docs + env example updated

## How to update this file

When a stage merges to `main`: set its status to `done`, clear “in progress”, clear or rewrite **Current WIP**, set **Next** to the following stage number.  
When starting a stage: set status to `in progress`, record the branch name, and fill **Current WIP**.  
When stage code is finished but awaiting user commit/PR: keep status `in progress` and note that in **Current WIP**.
