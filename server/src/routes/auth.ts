import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { isUserBlocked } from '../services/adminAccess.js';
import { hashPassword, verifyPassword } from '../utils/auth.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(50),
  role: z.enum(['jobseeker', 'employer', 'recruiter', 'admin']).catch('jobseeker').default('jobseeker')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [body.email]);
    if (existing.rowCount) {
      reply.code(409).send({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    const user = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      created_at: string;
    }>(
      `INSERT INTO users (email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, role, created_at`,
      [body.email.toLowerCase(), passwordHash, body.displayName, body.role]
    );

    const created = user.rows[0]!;
    const token = await reply.jwtSign({
      userId: created.id,
      email: created.email,
      role: created.role
    });

    reply.code(201).send({ token, user: created });
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const result = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      password_hash: string;
    }>('SELECT id, email, display_name, role, password_hash FROM users WHERE email = $1', [body.email.toLowerCase()]);

    if (!result.rowCount) {
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0]!;
    if (await isUserBlocked(user.id)) {
      reply.code(403).send({ error: 'Account blocked by admin' });
      return;
    }

    const valid = await verifyPassword(body.password, user.password_hash);
    if (!valid) {
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    const token = await reply.jwtSign({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    reply.send({
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role
      }
    });
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      fraud_score: string;
      trust_score: string;
      created_at: string;
    }>(
      'SELECT id, email, display_name, role, fraud_score, trust_score, created_at FROM users WHERE id = $1',
      [request.user.userId]
    );

    return { user: user.rows[0]! };
  });
};

export default authRoutes;
