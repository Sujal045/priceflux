# Priceflux delivery tracker

Source of truth for **what is done** and **what is next**.  
Agents and humans must update this file when a PR is merged or a stage starts.

Last updated: 2026-10-07

## Current WIP (read this first in a new chat)

**Stage 21** on branch `feat/21-productgroup-jsonld` — ProductGroup / hasVariant JSON-LD extraction.

Code ready for user commit / PR.

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
| 20 | Web UI (v2) | `feat/20-web-ui` | **done** | Merged via PR #21 |
| 21 | ProductGroup / hasVariant JSON-LD | `feat/21-productgroup-jsonld` | **in progress** | Awaiting commit/PR |

## Next

1. User commits + opens **PR 21** (`feat/21-productgroup-jsonld` → `main`).
2. After merge: ask before starting further work (v1 feature set is largely complete).

---

## Stage 21 brief — ProductGroup / hasVariant JSON-LD

**Goal:** Extract prices from Schema.org `ProductGroup` pages that nest SKUs in `hasVariant` (common on Odoo variant pages).

### In scope

- Extend `packages/scrape-core` extractor: when no top-level `Product`, expand `ProductGroup.hasVariant`.
- Among variants of a group, pick the **lowest** usable offer price.
- Fixtures + unit tests; update DELIVERY / USAGE.

### Out of scope

- `@id` cross-references between graph nodes (inline `hasVariant` only).
- HTML/CSS selectors, Web UI changes, schema migrations.

### Acceptance checklist

- [x] `product-group` fixtures extract a price
- [x] Existing Product / AggregateOffer / @graph tests still pass
- [x] Docs updated

## How to update this file

When a stage merges to `main`: set its status to `done`, clear “in progress”, clear or rewrite **Current WIP**, set **Next** to the following stage number.  
When starting a stage: set status to `in progress`, record the branch name, and fill **Current WIP**.  
When stage code is finished but awaiting user commit/PR: keep status `in progress` and note that in **Current WIP**.
