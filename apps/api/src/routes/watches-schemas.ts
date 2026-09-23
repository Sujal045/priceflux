import { z } from 'zod';

export const CreateWatchBodySchema = z.object({
  email: z.string().email(),
  url: z.string().url(),
  threshold: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(8).optional(),
});
export type CreateWatchBody = z.infer<typeof CreateWatchBodySchema>;

export const UpdateWatchBodySchema = z
  .object({
    threshold: z.number().nonnegative().nullable().optional(),
    currency: z.string().min(1).max(8).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.threshold !== undefined ||
      body.currency !== undefined ||
      body.active !== undefined,
    { message: 'At least one field is required' },
  );
export type UpdateWatchBody = z.infer<typeof UpdateWatchBodySchema>;

export const ListWatchesQuerySchema = z.object({
  email: z.string().email(),
});
