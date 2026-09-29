# Email drop alerts (stage 17)

When a scrape result has `price <= threshold`, the notifier emits alerts in this
order:

1. **Log** (always)
2. **Email** (when `NOTIFIER_SMTP_HOST` is set)
3. **Webhook** (when `NOTIFIER_WEBHOOK_URL` is set)

Recipient is the watch owner’s `users.email` (same address used when creating a
watch). No schema change.

## Local Mailpit

Compose includes [Mailpit](https://github.com/axllent/mailpit) as a catch-all
SMTP server + web inbox.

| Port env | Default | Purpose |
|----------|---------|---------|
| `MAILPIT_SMTP_PORT` | `1025` | SMTP (notifier → Mailpit) |
| `MAILPIT_UI_PORT` | `8025` | Web UI |

```bash
cp -n .env.example .env
# Uncomment NOTIFIER_SMTP_* in .env for local mail
docker compose -f infra/docker-compose.yml --env-file .env up -d
# Inbox: http://127.0.0.1:8025
```

Without `NOTIFIER_SMTP_HOST`, email is **off** — notifier still logs (± webhook).

## Env table

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `NOTIFIER_SMTP_HOST` | to enable email | unset | Unset = no email channel |
| `NOTIFIER_SMTP_PORT` | no | `1025` | Mailpit SMTP |
| `NOTIFIER_SMTP_FROM` | no | `priceflux@localhost` | Envelope From |
| `NOTIFIER_SMTP_USER` | no | — | Optional AUTH |
| `NOTIFIER_SMTP_PASS` | no | — | Optional AUTH; never commit |
| `NOTIFIER_SMTP_SECURE` | no | `false` | TLS from first byte (465) |
| `NOTIFIER_SMTP_REQUIRE_TLS` | no | `false` | STARTTLS upgrade |
| `MAILPIT_UI_URL` | for Mailpit test | `http://127.0.0.1:8025` | Search API base |

## How to verify

1. Start Compose (including Mailpit) and set SMTP env as above.
2. Run API + scraper + notifier; create a watch with a real-looking email and
   a fixture URL priced under the threshold (see [USAGE.md](USAGE.md)).
3. Open `http://127.0.0.1:8025` — message subject like
   `Price drop: … is now …`.
4. Metrics (`:9102/metrics`): `priceflux_alerts_total{outcome="email_sent"}`.

Optional automated check (Mailpit must be up, SMTP env set):

```bash
pnpm --filter @priceflux/worker-notifier test:mailpit
```

## Idempotency and send failures

`handleScrapeResult` inserts `price_history` **before** calling alert emitters.
Duplicate `jobId` returns `duplicate_job` and **does not** re-emit log/email/webhook.

**Chosen failure behavior (no outbox in v1):**

| Case | Behavior |
|------|----------|
| Missing `alert.email` | Skip email (warn + `email_skipped`); log/webhook continue |
| SMTP send error | Log + `email_failed`; throw → worker **nacks without requeue** |
| After history insert + failed email | History row stays; **no automatic re-mail** for that `jobId` (a requeue would hit `duplicate_job` and skip alerts by design) |

Ops: fix SMTP, then trigger a **new** scrape (new `jobId`) if the alert must be resent. A future outbox could retry email without re-inserting history.

Secrets: put `NOTIFIER_SMTP_PASS` only in `.env` (gitignored).
