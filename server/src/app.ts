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
import smsRoutes from './routes/sms.js';
import adminSmsRoutes from './routes/adminSms.js';
import adminHtmlRoutes from './routes/adminHtml.js';
import htmlRoutes from './routes/html.js';
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
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    const params = new URLSearchParams(body as string);
    const parsed: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      parsed[key] = value;
    }
    done(null, parsed);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Validation failed', details: error.flatten() });
      return;
    }

    app.log.error(error instanceof Error ? error : new Error(String(error)));
    reply.code(error.statusCode ?? 500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({ ok: true }));

  app.register(authRoutes, { prefix: '/api' });
  app.register(worldRoutes, { prefix: '/api' });
  app.register(actionsRoutes, { prefix: '/api' });
  app.register(federationRoutes, { prefix: '/api' });
  app.register(adminSmsRoutes);
  app.register(adminHtmlRoutes);
  app.register(smsRoutes);
  app.register(htmlRoutes);

  app.after(() => {
    app.wsHub = new WsHub(app);
  });

  return app;
}
