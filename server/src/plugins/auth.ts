import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { isUserBlocked } from '../services/adminAccess.js';

const authPlugin: FastifyPluginAsync = async (app) => {
  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
      const blocked = await isUserBlocked(request.user.userId);
      if (blocked) {
        return reply.code(403).send({ error: 'Account blocked by admin' });
      }
    } catch {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
};

export default fp(authPlugin);
