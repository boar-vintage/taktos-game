import { Pool } from 'pg';
import { env } from '../config/env.js';

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export async function query<T>(text: string, values?: unknown[]): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}
