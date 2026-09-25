import type { PriceSource } from '@priceflux/shared';

/** Successful price extraction from page HTML / structured data. */
export type ExtractedPrice = {
  price: number;
  currency: string;
  title?: string;
  source: ExtractPriceSource;
};

/** Sources this package can emit today (HTML/API land in later stages). */
export type ExtractPriceSource = Extract<PriceSource, 'json_ld'>;

export type ExtractFailureReason =
  | 'no_json_ld'
  | 'no_product'
  | 'no_price'
  | 'invalid_price';

export type ExtractResult =
  | { ok: true; data: ExtractedPrice }
  | { ok: false; reason: ExtractFailureReason };
