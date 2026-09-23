import type { FastifyPluginAsync } from 'fastify';

import {
  createWatchAndMaybeEnqueue,
  deactivateWatchById,
  getWatchById,
  listWatchesForEmail,
  updateWatchById,
} from '../services/watches.js';
import {
  CreateWatchBodySchema,
  ListWatchesQuerySchema,
  UpdateWatchBodySchema,
} from './watches-schemas.js';

export const watchesRoutes: FastifyPluginAsync = async (app) => {
  app.post('/watches', async (request, reply) => {
    const parsed = CreateWatchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await createWatchAndMaybeEnqueue({
        db: app.db,
        redis: app.redis,
        rabbit: app.rabbit,
        body: parsed.data,
      });
      return reply.status(result.created ? 201 : 200).send(result);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Invalid URL')) {
        return reply.status(400).send({ error: 'invalid_url', message: err.message });
      }
      throw err;
    }
  });

  app.get('/watches', async (request, reply) => {
    const parsed = ListWatchesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        details: parsed.error.flatten(),
      });
    }
    const items = await listWatchesForEmail(app.db, parsed.data.email);
    return { items };
  });

  app.get<{ Params: { id: string } }>('/watches/:id', async (request, reply) => {
    const watch = await getWatchById(app.db, request.params.id);
    if (!watch) {
      return reply.status(404).send({ error: 'not_found' });
    }
    return { watch };
  });

  app.patch<{ Params: { id: string } }>('/watches/:id', async (request, reply) => {
    const parsed = UpdateWatchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        details: parsed.error.flatten(),
      });
    }
    const watch = await updateWatchById(app.db, request.params.id, parsed.data);
    if (!watch) {
      return reply.status(404).send({ error: 'not_found' });
    }
    return { watch };
  });

  app.delete<{ Params: { id: string } }>('/watches/:id', async (request, reply) => {
    const watch = await deactivateWatchById(app.db, request.params.id);
    if (!watch) {
      return reply.status(404).send({ error: 'not_found' });
    }
    return { watch };
  });
};
