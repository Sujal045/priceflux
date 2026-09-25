export const PACKAGE_NAME = '@priceflux/scrape-core' as const;

export {
  extractPriceFromHtml,
  extractPriceFromJsonLdDocuments,
} from './extract.js';
export {
  collectJsonLdDocuments,
  flattenJsonLdNodes,
  typeIncludes,
} from './jsonld.js';
export type {
  ExtractedPrice,
  ExtractFailureReason,
  ExtractPriceSource,
  ExtractResult,
} from './types.js';
