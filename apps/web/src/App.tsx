import { useEffect, useState, type FormEvent } from 'react';

import {
  apiBaseUrl,
  createOrRecheckWatch,
  deactivateWatch,
  getWatchHistory,
  listWatches,
  recheckWatch,
  type PriceHistoryPoint,
  type WatchDto,
} from './api.js';

const EMAIL_KEY = 'priceflux.email';
/** Local cooldown after a recheck — matches the API's ~5-min URL dedupe window. */
const RECHECK_COOLDOWN_SECONDS = 300;

type Banner =
  | { kind: 'ok' | 'warn' | 'error'; text: string }
  | null;

type HistoryState = {
  open: boolean;
  loading: boolean;
  loaded: boolean;
  points: PriceHistoryPoint[];
  error?: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatMoney(price: number, currency: string | null): string {
  return `${price} ${currency ?? ''}`.trim();
}

function Sparkline({ points }: { points: PriceHistoryPoint[] }) {
  if (points.length < 2) {
    return null;
  }
  const width = 420;
  const height = 72;
  const pad = 6;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (p.price - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Price history trend"
    >
      <polyline className="spark-line" points={coords.join(' ')} />
      <circle
        className="spark-dot"
        cx={coords[coords.length - 1]?.split(',')[0]}
        cy={coords[coords.length - 1]?.split(',')[1]}
        r={3}
      />
    </svg>
  );
}

export function App() {
  const [email, setEmail] = useState(
    () => localStorage.getItem(EMAIL_KEY) ?? '',
  );
  const [watches, setWatches] = useState<WatchDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const [url, setUrl] = useState('');
  const [threshold, setThreshold] = useState('30');
  const [currency, setCurrency] = useState('USD');

  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<Record<string, HistoryState>>({});

  const anyCooldownActive = Object.values(cooldowns).some(
    (until) => until > now,
  );

  // Drive the recheck countdown only while a cooldown is active.
  useEffect(() => {
    if (!anyCooldownActive) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyCooldownActive]);

  async function refresh(nextEmail = email) {
    const trimmed = nextEmail.trim().toLowerCase();
    if (!trimmed) {
      setWatches([]);
      return;
    }
    setLoading(true);
    setBanner(null);
    try {
      const items = await listWatches(trimmed);
      setWatches(items);
      localStorage.setItem(EMAIL_KEY, trimmed);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to load watches',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem(EMAIL_KEY)?.trim();
    if (stored) {
      void refresh(stored);
    }
  }, []);

  async function onLoad(e: FormEvent) {
    e.preventDefault();
    await refresh();
  }

  function startCooldown(watchId: string, seconds: number) {
    setCooldowns((prev) => ({
      ...prev,
      [watchId]: Date.now() + seconds * 1000,
    }));
    setNow(Date.now());
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !url.trim()) {
      setBanner({ kind: 'warn', text: 'Email and product URL are required.' });
      return;
    }

    const thresholdNum = Number(threshold);
    setLoading(true);
    setBanner(null);
    try {
      const result = await createOrRecheckWatch({
        email: trimmedEmail,
        url: url.trim(),
        ...(Number.isFinite(thresholdNum) && threshold !== ''
          ? { threshold: thresholdNum }
          : {}),
        ...(currency.trim() ? { currency: currency.trim().toUpperCase() } : {}),
      });

      localStorage.setItem(EMAIL_KEY, trimmedEmail);
      setEmail(trimmedEmail);

      if (result.scrapeQueued) {
        startCooldown(result.watch.id, RECHECK_COOLDOWN_SECONDS);
        setBanner({
          kind: 'ok',
          text: result.created
            ? `Watch created and scrape queued (${result.jobId ?? 'job'}). The price appears here once the scraper runs.`
            : `Scrape queued for existing watch (${result.jobId ?? 'job'}).`,
        });
      } else {
        startCooldown(result.watch.id, result.dedupeTtlSeconds ?? 300);
        setBanner({
          kind: 'warn',
          text: `Watch saved, but a scrape ran recently. Recheck available in ~${result.dedupeTtlSeconds ?? 300}s.`,
        });
      }

      setUrl('');
      await refresh(trimmedEmail);
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Failed to create watch',
      });
    } finally {
      setLoading(false);
    }
  }

  async function onRecheck(watch: WatchDto) {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setBanner({ kind: 'warn', text: 'Load watches with your email first.' });
      return;
    }
    setBusyId(watch.id);
    setBanner(null);
    try {
      const result = await recheckWatch(watch.id);
      if (result.scrapeQueued) {
        startCooldown(watch.id, RECHECK_COOLDOWN_SECONDS);
        setBanner({
          kind: 'ok',
          text: `Recheck queued (${result.jobId ?? 'job'}). The price updates here after the scraper runs.`,
        });
      } else {
        startCooldown(watch.id, result.dedupeTtlSeconds ?? 300);
        setBanner({
          kind: 'warn',
          text: `Checked recently — recheck again in ~${result.dedupeTtlSeconds ?? 300}s.`,
        });
      }
      await refresh(trimmedEmail);
      if (history[watch.id]?.open) {
        await loadHistory(watch.id, true);
      }
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Recheck failed',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function onDeactivate(watch: WatchDto) {
    setBusyId(watch.id);
    setBanner(null);
    try {
      await deactivateWatch(watch.id);
      setBanner({ kind: 'ok', text: 'Watch deactivated.' });
      await refresh();
    } catch (err) {
      setBanner({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Deactivate failed',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function loadHistory(watchId: string, force = false) {
    const current = history[watchId];
    if (current?.loaded && !force) {
      return;
    }
    setHistory((prev) => ({
      ...prev,
      [watchId]: {
        open: true,
        loading: true,
        loaded: prev[watchId]?.loaded ?? false,
        points: prev[watchId]?.points ?? [],
      },
    }));
    try {
      const points = await getWatchHistory(watchId, 100);
      setHistory((prev) => ({
        ...prev,
        [watchId]: { open: true, loading: false, loaded: true, points },
      }));
    } catch (err) {
      setHistory((prev) => ({
        ...prev,
        [watchId]: {
          open: true,
          loading: false,
          loaded: false,
          points: prev[watchId]?.points ?? [],
          error: err instanceof Error ? err.message : 'Failed to load history',
        },
      }));
    }
  }

  function toggleHistory(watch: WatchDto) {
    const current = history[watch.id];
    const open = !(current?.open ?? false);
    setHistory((prev) => ({
      ...prev,
      [watch.id]: {
        open,
        loading: current?.loading ?? false,
        loaded: current?.loaded ?? false,
        points: current?.points ?? [],
        ...(current?.error ? { error: current.error } : {}),
      },
    }));
    if (open) {
      void loadHistory(watch.id);
    }
  }

  return (
    <div className="app">
      <header className="brand">
        <h1>Priceflux</h1>
        <p>
          Watch product URLs and get alerted when the price hits your threshold.
          Create a watch, recheck anytime, and track the price history — workers
          handle scrape, history, and email.
        </p>
      </header>

      {banner ? (
        <div className={`banner banner-${banner.kind}`}>{banner.text}</div>
      ) : null}

      <section className="panel">
        <h2>Your email</h2>
        <form className="row" onSubmit={onLoad}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Load watches'}
          </button>
        </form>
        <p className="meta">API: {apiBaseUrl()}</p>
      </section>

      <section className="panel">
        <h2>Add a watch</h2>
        <form className="row" onSubmit={onCreate}>
          <div className="field" style={{ flex: '2 1 18rem' }}>
            <label htmlFor="url">Product URL</label>
            <input
              id="url"
              type="url"
              placeholder="https://shop.example/product"
              value={url}
              onChange={(ev) => setUrl(ev.target.value)}
              required
            />
          </div>
          <div className="field" style={{ flex: '0 1 7rem' }}>
            <label htmlFor="threshold">Threshold</label>
            <input
              id="threshold"
              inputMode="decimal"
              value={threshold}
              onChange={(ev) => setThreshold(ev.target.value)}
            />
          </div>
          <div className="field" style={{ flex: '0 1 6rem' }}>
            <label htmlFor="currency">Currency</label>
            <input
              id="currency"
              value={currency}
              onChange={(ev) => setCurrency(ev.target.value)}
              maxLength={8}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            Watch + scrape
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Watches {watches.length > 0 ? `(${watches.length})` : ''}</h2>
        {watches.length === 0 ? (
          <p className="empty">
            No watches yet. Load an email or add a product URL above.
          </p>
        ) : (
          <div className="watch-list">
            {watches.map((watch) => {
              const until = cooldowns[watch.id] ?? 0;
              const remaining =
                until > now ? Math.ceil((until - now) / 1000) : 0;
              const onCooldown = remaining > 0;
              const hist = history[watch.id];
              const points = hist?.points ?? [];
              const ascending = [...points].reverse();
              const prices = points.map((p) => p.price);
              const min = prices.length ? Math.min(...prices) : null;
              const max = prices.length ? Math.max(...prices) : null;
              const dropPct =
                max && max > 0 && watch.latestPrice !== null
                  ? Math.round(((max - watch.latestPrice) / max) * 100)
                  : null;

              return (
                <article key={watch.id} className="watch">
                  <div className="watch-top">
                    <div>
                      <div className="watch-url">
                        <a href={watch.url} target="_blank" rel="noreferrer">
                          {watch.url}
                        </a>
                      </div>
                      <div className="watch-site">
                        {watch.site ?? hostOf(watch.url)}
                      </div>
                    </div>
                    <span
                      className={`badge ${watch.active ? 'badge-active' : 'badge-off'}`}
                    >
                      {watch.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="watch-stats">
                    <span>
                      Latest:{' '}
                      <strong>
                        {watch.latestPrice !== null
                          ? formatMoney(watch.latestPrice, watch.latestCurrency)
                          : 'No price yet'}
                      </strong>
                    </span>
                    <span>
                      Threshold:{' '}
                      <strong>
                        {watch.threshold !== null
                          ? formatMoney(watch.threshold, watch.currency)
                          : '—'}
                      </strong>
                    </span>
                    <span>
                      Last checked:{' '}
                      <strong>
                        {watch.lastCheckedAt
                          ? new Date(watch.lastCheckedAt).toLocaleString()
                          : '—'}
                      </strong>
                    </span>
                  </div>
                  <div className="watch-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === watch.id || !watch.active || onCooldown}
                      onClick={() => void onRecheck(watch)}
                    >
                      {onCooldown ? `Recheck in ${remaining}s` : 'Recheck now'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => toggleHistory(watch)}
                    >
                      {hist?.open ? 'Hide history' : 'History'}
                    </button>
                    {watch.active ? (
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busyId === watch.id}
                        onClick={() => void onDeactivate(watch)}
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </div>

                  {hist?.open ? (
                    <div className="history">
                      {hist.loading && points.length === 0 ? (
                        <p className="empty">Loading history…</p>
                      ) : hist.error ? (
                        <p className="banner banner-error">{hist.error}</p>
                      ) : points.length === 0 ? (
                        <p className="empty">
                          No price history yet. Recheck once the scraper is
                          running.
                        </p>
                      ) : (
                        <>
                          <div className="history-summary">
                            <span>
                              Points: <strong>{points.length}</strong>
                            </span>
                            {min !== null ? (
                              <span>
                                Min:{' '}
                                <strong>
                                  {formatMoney(min, watch.latestCurrency)}
                                </strong>
                              </span>
                            ) : null}
                            {max !== null ? (
                              <span>
                                Max:{' '}
                                <strong>
                                  {formatMoney(max, watch.latestCurrency)}
                                </strong>
                              </span>
                            ) : null}
                            {dropPct !== null ? (
                              <span>
                                Off peak: <strong>{dropPct}%</strong>
                              </span>
                            ) : null}
                          </div>
                          <Sparkline points={ascending} />
                          <ul className="history-list">
                            {points.slice(0, 10).map((p) => (
                              <li key={p.id}>
                                <span>
                                  {new Date(p.scrapedAt).toLocaleString()}
                                </span>
                                <strong>
                                  {formatMoney(p.price, p.currency)}
                                </strong>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="foot">
        Recheck enqueues a fresh scrape (<code>POST /watches/:id/check</code>) and
        respects the ~5-minute URL dedupe window — the button shows a countdown
        while a check is still fresh. Keep API + scraper + notifier running for
        prices and alerts.
      </p>
    </div>
  );
}
