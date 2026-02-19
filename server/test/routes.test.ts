import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://taktos:taktos@localhost:5432/taktos';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-key-123456';

let app: FastifyInstance;

describe('server routes', () => {
  beforeAll(async () => {
    const mod = await import('../src/app.js');
    app = mod.buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects malformed signup payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: { email: 'bad' }
    });

    expect(res.statusCode).toBe(400);
  });

  it('requires auth for actions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/actions/say',
      payload: { worldId: 'x', placeId: 'y', message: 'hello' }
    });

    expect(res.statusCode).toBe(401);
  });
});
