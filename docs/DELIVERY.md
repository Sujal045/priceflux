# Priceflux delivery tracker

Source of truth for **what is done** and **what is next**.  
Agents and humans must update this file when a PR is merged or a stage starts.

Last updated: 2026-09-25

## Current WIP (read this first in a new chat)

| Field | Value |
|-------|--------|
| Branch | `feat/11-jsonld-extractor` |
| Stage | **11** — `scrape-core` JSON-LD extractor |
| Code status | **Implemented locally; not committed / not pushed / no PR yet** |
| Scope | `packages/scrape-core` (+ docs). No Playwright. |
| Verify | `pnpm --filter @priceflux/scrape-core test` |
| After merge | Start stage **12** only when the user asks |

If `git status` shows a clean tree on `main` with stage 11 marked done, ignore this WIP block and follow **Next** below.

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
| 11 | `scrape-core` JSON-LD extractor | `feat/11-jsonld-extractor` | **in progress** | Fixtures + unit tests |
| 12 | Playwright happy path → results | `feat/12-scrape-happy-path` | pending | |
| 13 | DLX retries + dead letter | `feat/13-dlx-retries` | pending | |
| 14 | Notifier + price history | `feat/14-notifier` | pending | |
| 15 | Observability baseline | `feat/15-observability` | pending | |
| 16 | Anti-bot baseline (flagged) | `feat/16-antibot` | pending | |
| 17 | Prod hardening docs | `feat/17-prod-docs` | pending | |
| — | Web UI | — | **deferred (v2)** | Out of scope for v1 |

## Next

Finish **PR 11** (`feat/11-jsonld-extractor`) → merge to `main` → then start **PR 12** (Playwright happy path).

## How to update this file

When a stage merges to `main`: set its status to `done`, clear “in progress”, clear or rewrite **Current WIP**, set **Next** to the following stage number.  
When starting a stage: set status to `in progress`, record the branch name, and fill **Current WIP** (including whether code is still uncommitted).  
When stage code is finished but awaiting user commit/PR: keep status `in progress` and note that in **Current WIP**.
