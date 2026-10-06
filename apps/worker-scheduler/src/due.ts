/**
 * Whether a watch is due for another scrape.
 * Uses the latest price_history.scraped_at when present, otherwise watch.createdAt.
 */
export function isWatchDue(input: {
  lastScrapedAt: Date | null;
  watchCreatedAt: Date;
  watchIntervalMs: number;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const baseline = input.lastScrapedAt ?? input.watchCreatedAt;
  return now.getTime() - baseline.getTime() >= input.watchIntervalMs;
}
