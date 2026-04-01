import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { getPlace, listJobs, listNearbyUsers, listPlaces } from '../services/gameplay.js';

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

  app.get('/worlds/:worldId/presence', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { worldId: string };
    const query = request.query as { placeId?: string };
    return { users: await listNearbyUsers(params.worldId, query.placeId ?? null, request.user.userId) };
  });

  app.get('/businesses', async () => {
    const result = await pool.query<{
      id: string;
      name: string;
      description: string;
      category: string;
      address_text: string;
      logo_url: string | null;
      created_at: string;
    }>('SELECT id, name, description, category, address_text, logo_url, created_at FROM businesses ORDER BY name ASC');

    return { businesses: result.rows };
  });

  app.get('/businesses/:businessId', async (request, reply) => {
    const params = request.params as { businessId: string };

    const business = await pool.query<{
      id: string;
      name: string;
      description: string;
      category: string;
      address_text: string;
      logo_url: string | null;
      created_at: string;
    }>('SELECT id, name, description, category, address_text, logo_url, created_at FROM businesses WHERE id = $1', [params.businessId]);

    if (!business.rowCount) {
      reply.code(404).send({ error: 'Business not found' });
      return;
    }

    const places = await pool.query<{ id: string; name: string; world_id: string }>(
      'SELECT id, name, world_id FROM places WHERE business_id = $1 ORDER BY created_at ASC',
      [params.businessId]
    );

    return { business: business.rows[0]!, places: places.rows };
  });
};

export default worldRoutes;
