import { useEffect, useState, type FormEvent } from 'react';

import {
  apiBaseUrl,
  createOrRecheckWatch,
  deactivateWatch,
  listWatches,
  type WatchDto,
} from './api.js';

const EMAIL_KEY = 'priceflux.email';

type Banner =
  | { kind: 'ok' | 'warn' | 'error'; text: string }
  | null;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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
        setBanner({
          kind: 'ok',
          text: result.created
            ? `Watch created and scrape queued (${result.jobId ?? 'job'}).`
            : `Scrape queued for existing watch (${result.jobId ?? 'job'}).`,
        });
      } else {
        setBanner({
          kind: 'warn',
          text: `Watch saved, but scrape was deduped. Try again in ~${result.dedupeTtlSeconds ?? 300}s.`,
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
      const result = await createOrRecheckWatch({
        email: trimmedEmail,
        url: watch.url,
        ...(watch.threshold !== null ? { threshold: watch.threshold } : {}),
        ...(watch.currency ? { currency: watch.currency } : {}),
      });
      if (result.scrapeQueued) {
        setBanner({
          kind: 'ok',
          text: `Recheck queued (${result.jobId ?? 'job'}).`,
        });
      } else {
        setBanner({
          kind: 'warn',
          text: `Deduped — wait ~${result.dedupeTtlSeconds ?? 300}s before rechecking.`,
        });
      }
      await refresh(trimmedEmail);
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

  return (
    <div className="app">
      <header className="brand">
        <h1>Priceflux</h1>
        <p>
          Watch product URLs and get alerted when the price hits your threshold.
          Create a watch, then recheck anytime — workers handle scrape, history,
          and email.
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
            {watches.map((watch) => (
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
                    Threshold:{' '}
                    <strong>
                      {watch.threshold !== null
                        ? `${watch.threshold} ${watch.currency ?? ''}`.trim()
                        : '—'}
                    </strong>
                  </span>
                  <span>
                    Updated:{' '}
                    <strong>
                      {new Date(watch.updatedAt).toLocaleString()}
                    </strong>
                  </span>
                </div>
                <div className="watch-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId === watch.id || !watch.active}
                    onClick={() => void onRecheck(watch)}
                  >
                    Recheck now
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
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="foot">
        Recheck uses the same API as create (`POST /watches`) and respects the
        5-minute URL dedupe window. Keep API + scraper + notifier running for
        alerts.
      </p>
    </div>
  );
}
