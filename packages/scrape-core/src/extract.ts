import {
  collectJsonLdDocuments,
  flattenJsonLdNodes,
  typeIncludes,
} from './jsonld.js';
import type { ExtractedPrice, ExtractResult } from './types.js';

/**
 * Extract a product price from HTML by reading Schema.org JSON-LD
 * (`Product` / `ProductGroup`+`hasVariant` / `Offer` / `AggregateOffer`).
 * No network I/O.
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

  // Preserve prior behavior: first top-level Product with a usable offer wins.
  const products = nodes.filter(
    (n) => typeIncludes(n, 'Product') && !typeIncludes(n, 'ProductGroup'),
  );
  if (products.length > 0) {
    return extractFromProductList(products, { pick: 'first' });
  }

  // Variant pages (e.g. Odoo): ProductGroup with nested hasVariant Products.
  const groups = nodes.filter((n) => typeIncludes(n, 'ProductGroup'));
  if (groups.length === 0) {
    return { ok: false, reason: 'no_product' };
  }

  let sawInvalidPrice = false;
  for (const group of groups) {
    const variants = expandProductGroupVariants(group);
    if (variants.length === 0) continue;
    // Among variants of one group, prefer the lowest priced SKU.
    const result = extractFromProductList(variants, { pick: 'lowest' });
    if (result.ok) return result;
    if (result.reason === 'invalid_price') sawInvalidPrice = true;
  }

  if (sawInvalidPrice) {
    return { ok: false, reason: 'invalid_price' };
  }
  // Had ProductGroup(s) but no Product variants → treat as no product.
  const anyVariants = groups.some(
    (g) => expandProductGroupVariants(g).length > 0,
  );
  return { ok: false, reason: anyVariants ? 'no_price' : 'no_product' };
}

function expandProductGroupVariants(
  group: Record<string, unknown>,
): Record<string, unknown>[] {
  const groupName = readOptionalString(group.name);
  const variants: Record<string, unknown>[] = [];

  for (const variant of normalizeObjectList(group.hasVariant)) {
    if (!typeIncludes(variant, 'Product')) continue;
    if (!readOptionalString(variant.name) && groupName) {
      variants.push({ ...variant, name: groupName });
    } else {
      variants.push(variant);
    }
  }

  return variants;
}

function extractFromProductList(
  products: Record<string, unknown>[],
  options: { pick: 'first' | 'lowest' },
): ExtractResult {
  let sawInvalidPrice = false;
  let best: ExtractedPrice | undefined;

  for (const product of products) {
    const result = extractFromProduct(product);
    if (result.ok) {
      if (options.pick === 'first') {
        return result;
      }
      if (!best || result.data.price < best.price) {
        best = result.data;
      }
      continue;
    }
    if (result.reason === 'invalid_price') {
      sawInvalidPrice = true;
      if (options.pick === 'first') {
        return result;
      }
    }
  }

  if (best) {
    return { ok: true, data: best };
  }
  if (sawInvalidPrice) {
    return { ok: false, reason: 'invalid_price' };
  }
  return { ok: false, reason: 'no_price' };
}

function extractFromProduct(product: Record<string, unknown>): ExtractResult {
  const title = readOptionalString(product.name);
  const offers = normalizeObjectList(product.offers);

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

function normalizeObjectList(value: unknown): Record<string, unknown>[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter(
      (o): o is Record<string, unknown> =>
        o != null && typeof o === 'object' && !Array.isArray(o),
    );
  }
  if (typeof value === 'object') {
    return [value as Record<string, unknown>];
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
