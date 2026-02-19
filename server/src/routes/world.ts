import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db/pool.js';
import { appendEvent } from '../services/events.js';

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
    const places = await pool.query(
      `SELECT p.id, p.world_id, p.name, p.description, p.address_text, p.is_featured, p.created_at,
              COUNT(pr.user_id) FILTER (WHERE pr.status = 'online')::int AS online_count
       FROM places p
       LEFT JOIN presence pr ON pr.place_id = p.id
       WHERE p.world_id = $1
       GROUP BY p.id
       ORDER BY p.is_featured DESC, p.created_at ASC`,
      [params.worldId]
    );

    return { places: places.rows };
  });

  app.get('/places/:placeId', async (request, reply) => {
    const params = request.params as { placeId: string };

    const place = await pool.query(
      `SELECT p.id, p.name, p.description, p.address_text, p.world_id,
              COUNT(pr.user_id) FILTER (WHERE pr.status = 'online')::int AS online_count
       FROM places p
       LEFT JOIN presence pr ON pr.place_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [params.placeId]
    );

    if (!place.rowCount) {
      reply.code(404).send({ error: 'Place not found' });
      return;
    }

    return { place: place.rows[0]! };
  });

  app.get('/places/:placeId/jobs', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { placeId: string };

    const jobs = await pool.query(
      `SELECT id, place_id, title, description, location_text, is_active, created_at
       FROM jobs
       WHERE place_id = $1 AND is_active = TRUE
       ORDER BY created_at ASC`,
      [params.placeId]
    );

    const worldForPlace = await pool.query<{ world_id: string }>('SELECT world_id FROM places WHERE id = $1', [params.placeId]);
    if (worldForPlace.rowCount) {
      const event = await appendEvent({
        worldId: worldForPlace.rows[0]!.world_id,
        placeId: params.placeId,
        userId: request.user.userId,
        type: 'JobViewed',
        payload: { placeId: params.placeId, count: jobs.rowCount }
      });
      app.wsHub.broadcast(event);
    }

    return { jobs: jobs.rows };
  });
};

export default worldRoutes;
