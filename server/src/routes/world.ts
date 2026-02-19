import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { getPlace, listJobs, listPlaces } from '../services/gameplay.js';

const worldRoutes: FastifyPluginAsync = async (app) => {
  app.get('/worlds', async () => {
    const worlds = await pool.query<{
      id: string;
      slug: string;
      name: string;
      is_core: boolean;
      status: string;
      created_at: string;
    }>('SELECT id, slug, name, is_core, status, created_at FROM worlds ORDER BY is_core DESC, created_at ASC');

    return { worlds: worlds.rows };
  });

  app.get('/worlds/:worldId', async (request, reply) => {
    const params = request.params as { worldId: string };
    const world = await pool.query('SELECT id, slug, name, is_core, status, created_at FROM worlds WHERE id = $1', [params.worldId]);

    if (!world.rowCount) {
      reply.code(404).send({ error: 'World not found' });
      return;
    }

    return { world: world.rows[0]! };
  });

  app.get('/worlds/:worldId/places', async (request) => {
    const params = request.params as { worldId: string };
    return { places: await listPlaces(params.worldId) };
  });

  app.get('/places/:placeId', async (request, reply) => {
    const params = request.params as { placeId: string };
    const place = await getPlace(params.placeId);
    if (!place) {
      reply.code(404).send({ error: 'Place not found' });
      return;
    }

    return { place };
  });

  app.get('/places/:placeId/jobs', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { placeId: string };
    return { jobs: await listJobs(params.placeId, { app, userId: request.user.userId }) };
  });
};

export default worldRoutes;
