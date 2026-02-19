import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const dbEnv = z.object({
  DATABASE_URL: z.string().url().default('postgres://taktos:taktos@localhost:5432/taktos')
});

const { DATABASE_URL } = dbEnv.parse(process.env);

export const pool = new Pool({
  connectionString: DATABASE_URL
});

export async function query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}
