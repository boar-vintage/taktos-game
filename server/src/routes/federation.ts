import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';

const createWorldSchema = z.object({
  slug: z.string().min(3).max(64),
  name: z.string().min(3).max(120),
  status: z.string().default('planned')
});

const decayRuleSchema = z.object({
  worldId: z.string().uuid(),
  rules: z.record(z.string(), z.unknown())
});

const federationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/federation/portals', async () => {
    const portals = await pool.query(
      `SELECT p.id, p.name, p.is_required, p.created_at,
              p.from_world_id, fw.slug AS from_world_slug,
              p.to_world_id, tw.slug AS to_world_slug
       FROM portals p
       JOIN worlds fw ON fw.id = p.from_world_id
       JOIN worlds tw ON tw.id = p.to_world_id
       ORDER BY p.created_at DESC`
    );
    return { portals: portals.rows };
  });

  app.get('/federation/satellite-agreements', { preHandler: [app.authenticate] }, async () => {
    const agreements = await pool.query(
      `SELECT sa.world_id, w.slug, w.name,
              sa.rev_share_satellite, sa.rev_share_core,
              sa.api_fee_bps, sa.payout_schedule, sa.created_at
       FROM satellite_agreements sa
       JOIN worlds w ON w.id = sa.world_id
       ORDER BY sa.created_at DESC`
    );
    return { agreements: agreements.rows };
  });

  app.get('/federation/attribution-rules', { preHandler: [app.authenticate] }, async () => {
    const rules = await pool.query(
      `SELECT adr.id, adr.world_id, w.slug, adr.rules_json, adr.created_at
       FROM attribution_decay_rules adr
       JOIN worlds w ON w.id = adr.world_id
       ORDER BY adr.created_at DESC`
    );
    return { rules: rules.rows };
  });

  app.post('/federation/worlds', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      reply.code(403).send({ error: 'Admin required' });
      return;
    }

    const body = createWorldSchema.parse(request.body);
    const world = await pool.query(
      `INSERT INTO worlds (slug, name, is_core, status)
       VALUES ($1, $2, FALSE, $3)
       RETURNING id, slug, name, status, created_at`,
      [body.slug, body.name, body.status]
    );

    return { world: world.rows[0]! };
  });

  app.post('/federation/attribution-rules', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      reply.code(403).send({ error: 'Admin required' });
      return;
    }

    const body = decayRuleSchema.parse(request.body);
    const inserted = await pool.query(
      'INSERT INTO attribution_decay_rules (world_id, rules_json) VALUES ($1, $2) RETURNING *',
      [body.worldId, body.rules]
    );
    return { rule: inserted.rows[0]! };
  });
};

export default federationRoutes;
