import type { FastifyPluginAsync } from 'fastify';

import {
  createWatchAndMaybeEnqueue,
  deactivateWatchById,
  getWatchById,
  listPriceHistoryForWatch,
  listWatchesForEmail,
  recheckWatchById,
  updateWatchById,
} from '../services/watches.js';
import {
  CreateWatchBodySchema,
  ListWatchesQuerySchema,
  UpdateWatchBodySchema,
  WatchHistoryQuerySchema,
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

  app.get<{ Params: { id: string }; Querystring: unknown }>(
    '/watches/:id/history',
    async (request, reply) => {
      const parsed = WatchHistoryQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          details: parsed.error.flatten(),
        });
      }
      const watch = await getWatchById(app.db, request.params.id);
      if (!watch) {
        return reply.status(404).send({ error: 'not_found' });
      }
      const items = await listPriceHistoryForWatch(
        app.db,
        request.params.id,
        parsed.data.limit,
      );
      return { items };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/watches/:id/check',
    async (request, reply) => {
      const result = await recheckWatchById({
        db: app.db,
        redis: app.redis,
        rabbit: app.rabbit,
        id: request.params.id,
      });
      if (!result) {
        return reply.status(404).send({ error: 'not_found' });
      }
      // 202 when a scrape was enqueued; 200 when deduped (recently checked).
      return reply.status(result.scrapeQueued ? 202 : 200).send(result);
    },
  );

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
