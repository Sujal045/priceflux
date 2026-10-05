# Priceflux delivery tracker

Source of truth for **what is done** and **what is next**.  
Agents and humans must update this file when a PR is merged or a stage starts.

Last updated: 2026-10-05

## Current WIP (read this first in a new chat)

**Stage 18** on branch `feat/18-prod-docs` — prod hardening docs (quorum, HPA, DLX runbooks).

Docs ready for user commit / PR. **Do not start backlog work** until this merges and the user asks.

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
| 14 | Notifier + price history | `feat/14-notifier` | **done** | Merged via PR #13 — log + optional webhook only |
| 15 | Observability baseline | `feat/15-observability` | **done** | Merged via PR #14 |
| 16 | Anti-bot baseline (flagged) | `feat/16-antibot` | **done** | Merged via PR #15–#17 |
| 17 | Email drop alerts | `feat/17-email-alerts` | **done** | Merged via PR #18 |
| 18 | Prod hardening docs | `feat/18-prod-docs` | **in progress** | Docs only; awaiting commit/PR |
| — | Scheduled re-scrape / watch poller | — | **backlog** | No cron today; POST /watches only |
| — | ProductGroup / hasVariant JSON-LD | — | **backlog** | Separate small PR; Odoo variant pages |
| — | Web UI | — | **deferred (v2)** | Out of scope for v1 |

## Next

1. User commits + opens **PR 18** (`feat/18-prod-docs` → `main`).
2. After merge: pick backlog (scheduler, ProductGroup, or v2 UI) when the user asks.

---

## Stage 18 brief — prod hardening docs

**Goal:** Document how to harden Priceflux for production: quorum queues, scaling/HPA, and DLX / dead-letter runbooks. No application feature work in this PR.

### In scope

- `docs/PROD.md` covering:
  - Quorum vs local classic queues; migration caveats (TTL retries, drain/recreate).
  - Scaling guidance for API / scraper / notifier (prefetch, Chromium memory, shared Redis rate limits).
  - Dead-letter runbook: retry tiers, inspect `scrape.dead`, `pnpm replay:dead`, when not to replay; pointer to email failure semantics.
  - Secrets / observability alert starters.
- Update `docs/USAGE.md`, `README.md`, `docs/DELIVERY.md`; link from `infra/README.md`.

### Out of scope

- Changing `definitions.json` to quorum in Compose (keep local DX).
- Implementing a watch scheduler / cron.
- ProductGroup extractor, Web UI, K8s manifests as code (describe patterns only).

### Acceptance checklist

- [x] `docs/PROD.md` exists with quorum + HPA + DLX runbooks.
- [x] Local topology unchanged; docs say prod cutover is separate.
- [x] DELIVERY WIP / Next updated for stage 18 handoff.

## How to update this file

When a stage merges to `main`: set its status to `done`, clear “in progress”, clear or rewrite **Current WIP**, set **Next** to the following stage number.  
When starting a stage: set status to `in progress`, record the branch name, and fill **Current WIP** (including whether code is still uncommitted).  
When stage code is finished but awaiting user commit/PR: keep status `in progress` and note that in **Current WIP**.
