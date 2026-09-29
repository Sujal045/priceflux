# Priceflux delivery tracker

Source of truth for **what is done** and **what is next**.  
Agents and humans must update this file when a PR is merged or a stage starts.

Last updated: 2026-09-29

## Current WIP (read this first in a new chat)

**Stage 16** on branch `feat/16-antibot` — proxy config, Patchright stealth flag, Redis per-domain rate limits.

Pushed to `origin/feat/16-antibot`. **Merge PR 16 into `main` before starting stage 17.**  
If stage 16 is already merged: clear this WIP and start **17** (`feat/17-email-alerts`). See brief below.

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
| 16 | Anti-bot baseline (flagged) | `feat/16-antibot` | **in progress** | Merge before 17 |
| 17 | Email drop alerts | `feat/17-email-alerts` | pending | SMTP + local Mailpit; see brief |
| 18 | Prod hardening docs | `feat/18-prod-docs` | pending | Quorum, HPA, DLX runbooks (was 17) |
| — | ProductGroup / hasVariant JSON-LD | — | **backlog** | Separate small PR; Odoo variant pages |
| — | Web UI | — | **deferred (v2)** | Out of scope for v1 |

## Next

1. Merge **PR 16** (`feat/16-antibot`) → `main`.
2. Start **PR 17** (`feat/17-email-alerts`) when the user asks — real email for threshold alerts.
3. After 17: **PR 18** prod hardening docs (when asked).

---

## Stage 17 brief — email drop alerts

**Goal:** When `price <= threshold`, send a real email to the watch owner’s address (already on `users.email` / `PriceAlert.email`), in addition to the existing log stub (and optional webhook).

### In scope

- SMTP-based sender (e.g. `nodemailer`) behind the existing `AlertEmitter` interface in `apps/worker-notifier/src/alert.ts`.
- Env-driven config (extend `loadNotifierWorkerConfig`): host, port, user, pass, `from`, TLS flags; **off / no-op when unset** so local fixtures keep working without mail.
- Local inbox for dev: add **Mailpit** (or Mailhog) to `infra/docker-compose.yml` + `.env.example` ports; document Web UI URL.
- Keep composing emitters: **log always** → **email if configured** → **webhook if `NOTIFIER_WEBHOOK_URL` set**.
- Clear subject/body (plaintext + simple HTML ok): product title/url, price, currency, threshold, scrapedAt.
- Unit tests with a mock transport; optional integration test against Mailpit when a flag is set (same pattern as other `PRICEFLUX_*_INTEGRATION=1` tests).
- Metrics: count email send success/failure (extend `priceflux_alerts_total` labels or add a small email counter — stay consistent with `docs/OBSERVABILITY.md`).
- Docs: `docs/USAGE.md` + short `docs/EMAIL.md` (setup Mailpit, env table, how to verify).
- Update `docs/DELIVERY.md` WIP / status for stage 17.

### Out of scope (do not mix into this PR)

- Prod hardening docs (stage 18).
- `ProductGroup` / `hasVariant` extractor work (backlog).
- Web UI, user auth, email verification / unsubscribe flows.
- Marketing digests, SMS, push.
- Changing scrape / Rabbit topology / DB schema unless strictly required (prefer no migration; email uses existing `users.email`).

### Design constraints / do not miss

- **Idempotency:** duplicate `jobId` must still not re-send mail (existing `handleScrapeResult` behavior).
- **Missing email:** skip email emitter gracefully; still log; do not crash the consumer.
- **Send failures:** decide explicitly — prefer: log error, increment failure metric, **nack/requeue or retry policy** that does not double-insert `price_history` (history insert already happened before alert today — read `handle.ts` carefully; may need “alert after insert” ordering preserved with safe retry or outbox-lite). Document the chosen behavior in `docs/EMAIL.md`.
- **Secrets:** SMTP password only via `.env`; never commit real credentials.
- **One concern per PR;** tests in the same PR as the behavior.
- Branch: `feat/17-email-alerts` from updated `main` after 16 merges.

### Acceptance checklist

- [ ] With Mailpit up and SMTP env set, a successful scrape under threshold delivers a visible message in Mailpit UI.
- [ ] Without SMTP env, notifier still works (log ± webhook only).
- [ ] Unit tests cover template/emitter; integration optional but documented.
- [ ] USAGE + EMAIL docs updated; DELIVERY next set to 18 after handoff.

## How to update this file

When a stage merges to `main`: set its status to `done`, clear “in progress”, clear or rewrite **Current WIP**, set **Next** to the following stage number.  
When starting a stage: set status to `in progress`, record the branch name, and fill **Current WIP** (including whether code is still uncommitted).  
When stage code is finished but awaiting user commit/PR: keep status `in progress` and note that in **Current WIP**.
