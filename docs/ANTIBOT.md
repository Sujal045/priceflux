# Anti-bot baseline (stage 16)

Feature-flagged scraper protections. **Defaults keep local fixtures working**
(plain Playwright, no proxy, generous domain rate limit).

## Flags

| Env | Default | Meaning |
|-----|---------|---------|
| `SCRAPER_STEALTH` | `false` | `true` → launch via **Patchright** + stealth context (UA/locale/viewport, mask `navigator.webdriver`, block heavy assets) |
| `SCRAPER_PROXY_URL` | unset | Optional `http(s)://user:pass@host:port` for Chromium |
| `SCRAPER_DOMAIN_RATE_LIMIT` | `30` | Max scrapes per domain per window (`0` disables Redis limiting) |
| `SCRAPER_DOMAIN_RATE_WINDOW_SECONDS` | `60` | Fixed window length for the domain limiter |

## Local fixtures (recommended)

```bash
# .env — leave stealth/proxy off
SCRAPER_STEALTH=false
# SCRAPER_PROXY_URL=
SCRAPER_DOMAIN_RATE_LIMIT=0   # optional: skip Redis rate checks entirely
```

Serve `packages/scrape-core/fixtures/product-simple.html` and `POST /watches` as usual.

## Enabling stealth + proxy

```bash
SCRAPER_STEALTH=true
SCRAPER_PROXY_URL=http://user:pass@proxy.example:8080
SCRAPER_DOMAIN_RATE_LIMIT=10
SCRAPER_DOMAIN_RATE_WINDOW_SECONDS=60
```

Then restart `pnpm dev:worker-scraper`. First stealth boot may download Patchright’s Chromium once:

```bash
pnpm --filter @priceflux/worker-scraper exec patchright install chromium
```

## What this does *not* claim

- It will **not** reliably beat Amazon / Cloudflare / Akamai by itself.
- No captcha solvers, fingerprint farms, or sticky residential pools in this stage.
- Site ToS / robots.txt / local law still apply — use responsibly.

## Rate-limit behavior

When the Redis fixed-window limit is exceeded, the worker throws `rate_limited`
(classified as `http_429`) and the existing DLX retry path applies.

## Verify

```bash
# Worker logs on boot should show stealth/proxy/domainRateLimit
pnpm dev:worker-scraper

# With limit=1, a second scrape of the same host in the window should retry/429
```
