import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { getCoreWorldId } from '../services/gameplay.js';

const inviteSchema = z.object({
  max_uses: z.coerce.number().int().positive().default(1),
  expires_in_days: z.coerce.number().int().positive().max(365).default(7),
  world_id: z.string().uuid().optional()
});

const allowlistSchema = z.object({
  phone_e164: z.string().regex(/^\+[1-9]\d{7,14}$/),
  status: z.enum(['invited', 'active', 'blocked']).default('invited')
});

const usageQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

function assertAdmin(role: string): void {
  if (role !== 'admin') {
    throw new Error('Admin required');
  }
}

const adminSmsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/admin/sms/invites', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch {
      reply.code(403).send({ error: 'Admin required' });
      return;
    }

    const body = inviteSchema.parse(request.body);
    const worldId = body.world_id ?? (await getCoreWorldId());
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();

    const invite = await pool.query(
      `INSERT INTO sms_invite_codes (code, world_id, created_by_user_id, max_uses, uses_count, expires_at)
       VALUES ($1, $2, $3, $4, 0, NOW() + ($5 || ' days')::interval)
       RETURNING code, world_id, max_uses, uses_count, expires_at, created_at`,
      [code, worldId, request.user.userId, body.max_uses, String(body.expires_in_days)]
    );

    return { invite: invite.rows[0]! };
  });

  app.post('/admin/sms/allowlist', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch {
      reply.code(403).send({ error: 'Admin required' });
      return;
    }

    const body = allowlistSchema.parse(request.body);
    const row = await pool.query(
      `INSERT INTO sms_allowlist (phone_e164, status, activated_at)
       VALUES ($1, $2, CASE WHEN $2 = 'active' THEN NOW() ELSE NULL END)
       ON CONFLICT (phone_e164)
       DO UPDATE SET
         status = EXCLUDED.status,
         activated_at = CASE
           WHEN EXCLUDED.status = 'active' THEN COALESCE(sms_allowlist.activated_at, NOW())
           ELSE sms_allowlist.activated_at
         END
       RETURNING phone_e164, user_id, status, created_at, activated_at`,
      [body.phone_e164, body.status]
    );

    return { allowlist: row.rows[0]! };
  });

  app.get('/admin/sms/usage', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      assertAdmin(request.user.role);
    } catch {
      reply.code(403).send({ error: 'Admin required' });
      return;
    }

    const parsed = usageQuerySchema.parse(request.query ?? {});
    const day = parsed.day ?? new Date().toISOString().slice(0, 10);

    const usage = await pool.query(
      `SELECT phone_e164, day_date, inbound_count, outbound_count
       FROM sms_usage_daily
       WHERE day_date = $1::date
       ORDER BY outbound_count DESC, inbound_count DESC`,
      [day]
    );

    return { day, usage: usage.rows };
  });
};

export default adminSmsRoutes;
