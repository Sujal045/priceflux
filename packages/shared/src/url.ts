import { createHash } from 'node:crypto';

/** Query params stripped during URL canonicalization (tracking / session noise). */
const STRIP_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'ref',
  'ref_',
  'referrer',
  'spm',
  'srsltid',
]);

function shouldStripParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (STRIP_PARAMS.has(lower)) return true;
  if (lower.startsWith('utm_')) return true;
  return false;
}

/**
 * Normalize a product URL for dedupe and scrape identity.
 * - Requires an absolute http(s) URL
 * - Lowercases scheme/host
 * - Drops hash / fragment
 * - Removes common tracking params
 * - Sorts remaining query params
 * - Strips a trailing slash (except bare origin `/`)
 */
export function canonicalizeUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';

  const kept = [...parsed.searchParams.entries()]
    .filter(([key]) => !shouldStripParam(key))
    .sort(([a], [b]) => a.localeCompare(b) || 0);

  parsed.search = '';
  for (const [key, value] of kept) {
    parsed.searchParams.append(key, value);
  }

  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  parsed.pathname = path === '' ? '/' : path;

  return parsed.toString();
}

/** SHA-256 hex of the canonical URL — used as Redis / message dedupe key. */
export function dedupeKeyForUrl(url: string): string {
  const canonical = canonicalizeUrl(url);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
