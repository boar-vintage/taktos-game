import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function run() {
  await ensureMigrationsTable();

  const migrationDir = path.join(__dirname, '..', 'migrations');
  const files = (await fs.readdir(migrationDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const alreadyRan = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (alreadyRan.rowCount) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationDir, filename), 'utf-8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await pool.query('COMMIT');
      console.log(`Applied migration: ${filename}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  await pool.end();
}

run().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
