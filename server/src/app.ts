import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import worldRoutes from './routes/world.js';
import actionsRoutes from './routes/actions.js';
import federationRoutes from './routes/federation.js';
import { WsHub } from './services/wsHub.js';
import { ZodError } from 'zod';

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute'
  });
  app.register(jwt, { secret: env.JWT_SECRET });
  app.register(authPlugin);

  app.decorate('wsHub', null as unknown as WsHub);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation failed', details: error.flatten() });
      return;
    }

    reply.code(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ ok: true }));

  app.register(authRoutes, { prefix: '/api' });
  app.register(worldRoutes, { prefix: '/api' });
  app.register(actionsRoutes, { prefix: '/api' });
  app.register(federationRoutes, { prefix: '/api' });

  app.after(() => {
    app.wsHub = new WsHub(app);
  });

  return app;
}
