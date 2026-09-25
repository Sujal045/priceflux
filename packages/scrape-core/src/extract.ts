import {
  collectJsonLdDocuments,
  flattenJsonLdNodes,
  typeIncludes,
} from './jsonld.js';
import type { ExtractedPrice, ExtractResult } from './types.js';

/**
 * Extract a product price from HTML by reading Schema.org JSON-LD
 * (`Product` / `Offer` / `AggregateOffer`). No network I/O.
 */
export function extractPriceFromHtml(html: string): ExtractResult {
  const documents = collectJsonLdDocuments(html);
  if (documents.length === 0) {
    return { ok: false, reason: 'no_json_ld' };
  }
  return extractPriceFromJsonLdDocuments(documents);
}

/** Same extraction rules against already-parsed JSON-LD documents. */
export function extractPriceFromJsonLdDocuments(
  documents: unknown[],
): ExtractResult {
  const nodes = flattenJsonLdNodes(documents);
  const products = nodes.filter((n) => typeIncludes(n, 'Product'));

  if (products.length === 0) {
    return { ok: false, reason: 'no_product' };
  }

  for (const product of products) {
    const result = extractFromProduct(product);
    if (result.ok) return result;
    if (result.reason === 'invalid_price') return result;
  }

  return { ok: false, reason: 'no_price' };
}

function extractFromProduct(product: Record<string, unknown>): ExtractResult {
  const title = readOptionalString(product.name);
  const offers = normalizeOffers(product.offers);

  for (const offer of offers) {
    const parsed = parseOffer(offer);
    if (!parsed) continue;
    if (!Number.isFinite(parsed.price) || parsed.price < 0) {
      return { ok: false, reason: 'invalid_price' };
    }
    if (!parsed.currency) {
      continue;
    }

    const data: ExtractedPrice = {
      price: parsed.price,
      currency: parsed.currency,
      source: 'json_ld',
    };
    if (title) data.title = title;
    return { ok: true, data };
  }

  return { ok: false, reason: 'no_price' };
}

function normalizeOffers(offers: unknown): Record<string, unknown>[] {
  if (offers == null) return [];
  if (Array.isArray(offers)) {
    return offers.filter(
      (o): o is Record<string, unknown> =>
        o != null && typeof o === 'object' && !Array.isArray(o),
    );
  }
  if (typeof offers === 'object') {
    return [offers as Record<string, unknown>];
  }
  return [];
}

function parseOffer(
  offer: Record<string, unknown>,
): { price: number; currency: string } | null {
  const currency =
    readOptionalString(offer.priceCurrency) ??
    readOptionalString(offer.currency);

  if (typeIncludes(offer, 'AggregateOffer')) {
    const low = parseMoney(offer.lowPrice);
    const high = parseMoney(offer.highPrice);
    const price = low ?? high;
    if (price == null || !currency) return null;
    return { price, currency };
  }

  // Offer, UnitPriceSpecification, or untyped offer objects with price fields.
  const price = parseMoney(offer.price);
  if (price == null || !currency) return null;
  return { price, currency };
}

function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
