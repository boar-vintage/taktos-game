import { env } from './config/env.js';
import { buildApp } from './app.js';
import { pool } from './db/pool.js';

async function start() {
  const app = buildApp();

  app.addHook('onClose', async () => {
    await pool.end();
  });

  await app.listen({ port: env.PORT, host: env.HOST });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
