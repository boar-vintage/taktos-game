import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { appendEvent } from './events.js';
import { sanitizeChatInput } from '../utils/sanitize.js';

interface PlaceRow {
  id: string;
  world_id: string;
  name: string;
  description: string;
  address_text: string;
  is_featured: boolean;
  created_at: string;
  online_count: number;
}

interface JobRow {
  id: string;
  place_id: string;
  title: string;
  description: string;
  location_text: string;
  is_active: boolean;
  created_at: string;
}

export async function getCoreWorldId(): Promise<string> {
  const world = await pool.query<{ id: string }>("SELECT id FROM worlds WHERE slug = 'core' LIMIT 1");
  if (!world.rowCount) {
    throw new Error('Core world is not seeded');
  }
  return world.rows[0]!.id;
}

export async function listPlaces(worldId: string): Promise<PlaceRow[]> {
  const places = await pool.query<PlaceRow>(
    `SELECT p.id, p.world_id, p.name, p.description, p.address_text, p.is_featured, p.created_at,
            COUNT(pr.user_id) FILTER (WHERE pr.status = 'online')::int AS online_count
     FROM places p
     LEFT JOIN presence pr ON pr.place_id = p.id
     WHERE p.world_id = $1
     GROUP BY p.id
     ORDER BY p.is_featured DESC, p.created_at ASC`,
    [worldId]
  );

  return places.rows;
}

export async function getPlace(placeId: string) {
  const place = await pool.query<{
    id: string;
    name: string;
    description: string;
    address_text: string;
    world_id: string;
    online_count: number;
  }>(
    `SELECT p.id, p.name, p.description, p.address_text, p.world_id,
            COUNT(pr.user_id) FILTER (WHERE pr.status = 'online')::int AS online_count
     FROM places p
     LEFT JOIN presence pr ON pr.place_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [placeId]
  );

  return place.rows[0] ?? null;
}

export async function listJobs(placeId: string, opts?: { app?: FastifyInstance; userId?: string }): Promise<JobRow[]> {
  const jobs = await pool.query<JobRow>(
    `SELECT id, place_id, title, description, location_text, is_active, created_at
     FROM jobs
     WHERE place_id = $1 AND is_active = TRUE
     ORDER BY created_at ASC`,
    [placeId]
  );

  if (opts?.app && opts.userId) {
    const worldForPlace = await pool.query<{ world_id: string }>('SELECT world_id FROM places WHERE id = $1', [placeId]);
    if (worldForPlace.rowCount) {
      const event = await appendEvent({
        worldId: worldForPlace.rows[0]!.world_id,
        placeId,
        userId: opts.userId,
        type: 'JobViewed',
        payload: { placeId, count: jobs.rowCount }
      });
      opts.app.wsHub.broadcast(event);
    }
  }

  return jobs.rows;
}

export async function joinWorldAction(input: { app: FastifyInstance; worldId: string; userId: string }) {
  await pool.query(
    `INSERT INTO presence (user_id, world_id, place_id, status, last_seen_at)
     VALUES ($1, $2, NULL, 'online', NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET world_id = EXCLUDED.world_id, place_id = NULL, status = 'online', last_seen_at = NOW()`,
    [input.userId, input.worldId]
  );

  const event = await appendEvent({
    worldId: input.worldId,
    userId: input.userId,
    type: 'PlayerJoinedWorld',
    payload: { userId: input.userId, worldId: input.worldId }
  });
  input.app.wsHub.broadcast(event);
}

export async function enterPlaceAction(input: { app: FastifyInstance; worldId: string; placeId: string; userId: string }) {
  await pool.query(
    `INSERT INTO presence (user_id, world_id, place_id, status, last_seen_at)
     VALUES ($1, $2, $3, 'online', NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET world_id = EXCLUDED.world_id, place_id = EXCLUDED.place_id, status = 'online', last_seen_at = NOW()`,
    [input.userId, input.worldId, input.placeId]
  );

  const event = await appendEvent({
    worldId: input.worldId,
    placeId: input.placeId,
    userId: input.userId,
    type: 'PlayerEnteredPlace',
    payload: { userId: input.userId, placeId: input.placeId }
  });
  input.app.wsHub.broadcast(event);
}

export async function leavePlaceAction(input: { app: FastifyInstance; worldId: string; userId: string }) {
  await pool.query(
    `INSERT INTO presence (user_id, world_id, place_id, status, last_seen_at)
     VALUES ($1, $2, NULL, 'online', NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET world_id = EXCLUDED.world_id, place_id = NULL, status = 'online', last_seen_at = NOW()`,
    [input.userId, input.worldId]
  );

  const event = await appendEvent({
    worldId: input.worldId,
    userId: input.userId,
    type: 'PlayerLeftPlace',
    payload: { userId: input.userId }
  });
  input.app.wsHub.broadcast(event);
}

export async function sayAction(input: {
  app: FastifyInstance;
  worldId: string;
  placeId: string;
  userId: string;
  message: string;
}) {
  const msg = sanitizeChatInput(input.message);
  if (!msg.normalized) {
    throw new Error('Message is empty after sanitization');
  }

  const event = await appendEvent({
    worldId: input.worldId,
    placeId: input.placeId,
    userId: input.userId,
    type: 'ChatMessageSent',
    payload: {
      raw: msg.raw,
      normalized: msg.normalized
    }
  });
  input.app.wsHub.broadcast(event);

  return msg.normalized;
}

export async function emoteAction(input: {
  app: FastifyInstance;
  worldId: string;
  placeId: string;
  userId: string;
  emote: string;
}) {
  const event = await appendEvent({
    worldId: input.worldId,
    placeId: input.placeId,
    userId: input.userId,
    type: 'EmoteSent',
    payload: { emote: input.emote.toUpperCase() }
  });
  input.app.wsHub.broadcast(event);
}

export async function createUnlockTransaction(input: {
  app: FastifyInstance;
  worldId: string;
  placeId: string;
  jobId: string;
  buyerUserId: string;
  originWorldId?: string;
}) {
  const tx = await pool.query(
    `INSERT INTO unlock_transactions (
       world_id, place_id, job_id, buyer_user_id, status, price_cents, currency, origin_world_id, attribution_world_id
     ) VALUES ($1, $2, $3, $4, 'created', $5, $6, $7, $8)
     RETURNING *`,
    [
      input.worldId,
      input.placeId,
      input.jobId,
      input.buyerUserId,
      env.UNLOCK_PRICE_CENTS,
      env.UNLOCK_CURRENCY,
      input.originWorldId ?? input.worldId,
      input.originWorldId ?? input.worldId
    ]
  );

  const event = await appendEvent({
    worldId: input.worldId,
    placeId: input.placeId,
    userId: input.buyerUserId,
    type: 'ContactUnlockRequested',
    payload: { transactionId: tx.rows[0]!.id, jobId: input.jobId }
  });
  input.app.wsHub.broadcast(event);

  return tx.rows[0]!;
}

export async function getPresenceSnapshot(worldId: string, placeId: string | null) {
  const worldCount = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM presence WHERE world_id = $1 AND status = 'online'",
    [worldId]
  );

  const placeCount = placeId
    ? await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM presence WHERE place_id = $1 AND status = 'online'",
        [placeId]
      )
    : { rows: [{ count: '0' }] };

  return {
    onlineWorld: Number(worldCount.rows[0]?.count ?? '0'),
    onlinePlace: Number(placeCount.rows[0]?.count ?? '0')
  };
}
