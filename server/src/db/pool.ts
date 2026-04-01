import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const dbEnv = z.object({
  DATABASE_URL: z.string().url().default('postgres://taktos:taktos@localhost:5432/taktos')
});

const { DATABASE_URL } = dbEnv.parse(process.env);

// No SSL for local or Railway private networking (.internal); require SSL elsewhere
const isLocalOrInternal =
  DATABASE_URL.includes('localhost') ||
  DATABASE_URL.includes('127.0.0.1') ||
  DATABASE_URL.includes('.internal');

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocalOrInternal ? false : { rejectUnauthorized: false }
});

export async function query<T extends QueryResultRow>(text: string, values?: unknown[]): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}
