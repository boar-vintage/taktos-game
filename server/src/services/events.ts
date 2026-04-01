import { pool } from '../db/pool.js';

export type EventType =
  | 'PlayerJoinedWorld'
  | 'PlayerEnteredPlace'
  | 'PlayerLeftPlace'
  | 'ChatMessageSent'
  | 'EmoteSent'
  | 'TakTakSent'
  | 'ResumeDropped'
  | 'JobViewed'
  | 'ContactUnlockRequested'
  | 'ContactUnlocked'
  | 'DMMessageSent';

export interface AppEvent {
  id: number;
  world_id: string;
  place_id: string | null;
  user_id: string | null;
  type: EventType;
  payload_json: Record<string, unknown>;
  created_at: string;
}

export async function appendEvent(input: {
  worldId: string;
  placeId?: string | null;
  userId?: string | null;
  type: EventType;
  payload: Record<string, unknown>;
}): Promise<AppEvent> {
  const result = await pool.query<AppEvent>(
    `INSERT INTO events (world_id, place_id, user_id, type, payload_json)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.worldId, input.placeId ?? null, input.userId ?? null, input.type, JSON.stringify(input.payload)]
  );

  return result.rows[0]!;
}
