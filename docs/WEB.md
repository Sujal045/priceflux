# Web UI (stage 20 / v2)

Browser UI for Priceflux watches. Talks to the existing Fastify API — no separate
backend. Auth is still email-only (same as `POST /watches`).

## Run

```bash
# terminal A — API (CORS enabled for Vite by default)
pnpm dev:api

# terminal B/C/D — workers as needed for scrapes/alerts
pnpm dev:worker-scraper
pnpm dev:worker-notifier
pnpm dev:worker-scheduler   # optional auto recheck

# terminal E — UI
pnpm dev:web
# open http://127.0.0.1:5173
```

## What you can do

| Action | API used |
|--------|----------|
| Load watches by email | `GET /watches?email=` |
| Add watch + enqueue scrape | `POST /watches` |
| Recheck price | `POST /watches` (same email + url) |
| Deactivate | `DELETE /watches/:id` |

Recheck respects the Redis **5-minute URL dedupe** window — the UI surfaces
`scrapeQueued: false` with remaining TTL.

## Env

| Variable | Where | Default |
|----------|-------|---------|
| `VITE_API_BASE_URL` | web (build/dev) | `http://127.0.0.1:3000` |
| `API_CORS_ORIGINS` | API | `http://127.0.0.1:5173,http://localhost:5173` |

Set `API_CORS_ORIGINS=` (empty) to disable CORS.

## Build

```bash
pnpm --filter @priceflux/web build
pnpm --filter @priceflux/web preview
```

## Out of scope (this PR)

- Login / API keys / email verification
- Price history charts
- Deployed static hosting config beyond Vite build
