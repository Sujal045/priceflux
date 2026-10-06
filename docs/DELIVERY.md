# Priceflux delivery tracker

Source of truth for **what is done** and **what is next**.  
Agents and humans must update this file when a PR is merged or a stage starts.

Last updated: 2026-10-05

## Current WIP (read this first in a new chat)

**Stage 19** on branch `feat/19-scheduled-rescrape` — periodic watch poller / scheduler worker.

Code ready for user commit / PR. **Do not start backlog items** until this merges and the user asks.

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
| 19 | Scheduled re-scrape | `feat/19-scheduled-rescrape` | **in progress** | Scheduler worker; awaiting commit/PR |
| — | ProductGroup / hasVariant JSON-LD | — | **backlog** | Separate small PR |
| — | Web UI | — | **deferred (v2)** | Out of scope for v1 |

## Next

1. User commits + opens **PR 19** (`feat/19-scheduled-rescrape` → `main`).
2. After merge: backlog (ProductGroup) or v2 UI when the user asks.

---

## Stage 19 brief — scheduled re-scrape

**Goal:** Active watches are re-enqueued on an interval without calling `POST /watches` again.

### In scope

- `apps/worker-scheduler`: poll DB, enqueue due watches via shared `tryEnqueueWatchScrape`.
- Extract enqueue helper to `@priceflux/mq`; refactor API to use it.
- Due logic: `max(price_history.scraped_at)` or `watch.created_at` + `SCHEDULER_WATCH_INTERVAL_SECONDS`.
- Env: poll interval, watch interval, metrics port `:9103`.
- Unit + optional integration test; `docs/SCHEDULER.md`; update USAGE / DELIVERY / OBSERVABILITY.

### Out of scope

- Per-watch custom intervals (schema change).
- Cron syntax / external schedulers (simple interval only).
- ProductGroup, Web UI.

### Acceptance checklist

- [x] Scheduler enqueues due active watches; skips inactive and recently scraped.
- [x] Redis URL dedupe still applies.
- [x] API create-watch path unchanged behavior via shared enqueue.
- [x] Docs + env example updated.

## How to update this file

When a stage merges to `main`: set its status to `done`, clear “in progress”, clear or rewrite **Current WIP**, set **Next** to the following stage number.  
When starting a stage: set status to `in progress`, record the branch name, and fill **Current WIP**.  
When stage code is finished but awaiting user commit/PR: keep status `in progress` and note that in **Current WIP**.
