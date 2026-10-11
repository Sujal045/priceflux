export type WatchDto = {
  id: string;
  userId: string;
  url: string;
  canonicalUrl: string;
  dedupeKey: string;
  site: string | null;
  threshold: number | null;
  currency: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  latestPrice: number | null;
  latestCurrency: string | null;
  lastCheckedAt: string | null;
};

export type PriceHistoryPoint = {
  id: string;
  watchId: string;
  jobId: string;
  price: number;
  currency: string;
  title: string | null;
  source: string;
  scrapedAt: string;
  createdAt: string;
};

export type CreateWatchResult = {
  watch: WatchDto;
  created: boolean;
  scrapeQueued: boolean;
  jobId?: string;
  dedupeTtlSeconds?: number;
};

export type RecheckResult = {
  watch: WatchDto;
  scrapeQueued: boolean;
  jobId?: string;
  dedupeTtlSeconds?: number;
};

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    '',
  ) ?? 'http://127.0.0.1:3000';

async function parseJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return body as T;
}

export async function listWatches(email: string): Promise<WatchDto[]> {
  const res = await fetch(
    `${API_BASE}/watches?email=${encodeURIComponent(email)}`,
  );
  const data = await parseJson<{ items: WatchDto[] }>(res);
  return data.items;
}

export async function createOrRecheckWatch(input: {
  email: string;
  url: string;
  threshold?: number;
  currency?: string;
}): Promise<CreateWatchResult> {
  const res = await fetch(`${API_BASE}/watches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<CreateWatchResult>(res);
}

/** Dedicated recheck: enqueue a scrape for an existing watch by id. */
export async function recheckWatch(id: string): Promise<RecheckResult> {
  const res = await fetch(`${API_BASE}/watches/${id}/check`, {
    method: 'POST',
  });
  return parseJson<RecheckResult>(res);
}

export async function getWatchHistory(
  id: string,
  limit = 50,
): Promise<PriceHistoryPoint[]> {
  const res = await fetch(
    `${API_BASE}/watches/${id}/history?limit=${encodeURIComponent(limit)}`,
  );
  const data = await parseJson<{ items: PriceHistoryPoint[] }>(res);
  return data.items;
}

export async function deactivateWatch(id: string): Promise<WatchDto> {
  const res = await fetch(`${API_BASE}/watches/${id}`, { method: 'DELETE' });
  const data = await parseJson<{ watch: WatchDto }>(res);
  return data.watch;
}

export function apiBaseUrl(): string {
  return API_BASE;
}
