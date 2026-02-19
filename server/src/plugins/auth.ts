import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
};

export default fp(authPlugin);
