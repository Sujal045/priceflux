import { z } from 'zod';

export const ErrorClassSchema = z.enum([
  'timeout',
  'http_403',
  'http_429',
  'captcha',
  'parse',
  'proxy',
  'unknown',
]);
export type ErrorClass = z.infer<typeof ErrorClassSchema>;

export const PriceSourceSchema = z.enum(['json_ld', 'html', 'api']);
export type PriceSource = z.infer<typeof PriceSourceSchema>;

/** Body published to scrape.work / scrape.job (and requeued after retry TTL). */
export const ScrapeJobSchema = z.object({
  jobId: z.string().uuid(),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  dedupeKey: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
  userId: z.string().min(1),
  watchId: z.string().uuid().optional(),
  productId: z.string().min(1).optional(),
  site: z.string().min(1).optional(),
  threshold: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(8).optional(),
  requestedAt: z.string().datetime(),
});
export type ScrapeJob = z.infer<typeof ScrapeJobSchema>;

/** Body published to results.topic / results.ready. */
export const ScrapeResultSchema = z.object({
  jobId: z.string().uuid(),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  userId: z.string().min(1),
  watchId: z.string().uuid().optional(),
  price: z.number().nonnegative(),
  currency: z.string().min(1).max(8),
  title: z.string().min(1).optional(),
  scrapedAt: z.string().datetime(),
  source: PriceSourceSchema,
});
export type ScrapeResult = z.infer<typeof ScrapeResultSchema>;

/**
 * RabbitMQ application headers for scrape jobs.
 * Values are often strings on the wire; coerce numerics.
 */
export const ScrapeJobHeadersSchema = z.object({
  'x-attempt': z.coerce.number().int().positive(),
  'x-max-attempts': z.coerce.number().int().positive().default(5),
  'x-first-failure-at': z.string().datetime().optional(),
  'x-error-class': ErrorClassSchema.optional(),
  'x-dedupe-key': z
    .string()
    .length(64)
    .regex(/^[a-f0-9]{64}$/),
});
export type ScrapeJobHeaders = z.infer<typeof ScrapeJobHeadersSchema>;
