import { pool } from '../../db/pool.js';

export async function markHtmlPresenceOnline(input: {
  userId: string;
  worldId: string;
  placeId: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO presence (user_id, world_id, place_id, status, last_seen_at)
     VALUES ($1, $2, $3, 'online', NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       world_id = EXCLUDED.world_id,
       place_id = EXCLUDED.place_id,
       status = 'online',
       last_seen_at = NOW()`,
    [input.userId, input.worldId, input.placeId]
  );
}

export async function touchPresenceLastSeen(userId: string): Promise<void> {
  await pool.query(
    `UPDATE presence
     SET status = 'online', last_seen_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );
}
