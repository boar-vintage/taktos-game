import { pool } from '../db/pool.js';

export async function isUserBlocked(userId: string): Promise<boolean> {
  const result = await pool.query<{ blocked: boolean }>(
    `SELECT EXISTS(
       SELECT 1
       FROM admin_user_blocks
       WHERE user_id = $1
         AND unblocked_at IS NULL
     ) AS blocked`,
    [userId]
  );

  return Boolean(result.rows[0]?.blocked);
}
