import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://taktos:taktos@localhost:5432/taktos';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-key-123456';

const TEST_ADMIN_EMAIL = 'test-admin@admin-test.invalid';
const TEST_USER_EMAIL = 'test-nonadmin@admin-test.invalid';

let app: FastifyInstance;
let pool: Pool;
let adminUserId: string;
let nonAdminUserId: string;

async function createTestUser(
  pg: Pool,
  email: string,
  role: 'admin' | 'jobseeker'
): Promise<string> {
  const result = await pg.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, 'hash-not-used', $2, $3)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
     RETURNING id`,
    [email, `Test ${role}`, role]
  );
  return result.rows[0]!.id;
}

function makeCookie(appInstance: FastifyInstance, userId: string, email: string, role: string): string {
  const token = appInstance.jwt.sign({ userId, email, role });
  return `takt_jwt=${encodeURIComponent(token)}`;
}

describe('/admin route', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const mod = await import('../src/app.js');
    app = mod.buildApp();
    await app.ready();

    adminUserId = await createTestUser(pool, TEST_ADMIN_EMAIL, 'admin');
    nonAdminUserId = await createTestUser(pool, TEST_USER_EMAIL, 'jobseeker');
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM users WHERE email = ANY($1::text[])`,
      [[TEST_ADMIN_EMAIL, TEST_USER_EMAIL]]
    );
    await pool.end();
    await app.close();
  });

  describe('GET /admin — happy path', () => {
    it('returns 200 with Content-Type text/html for a logged-in admin user', async () => {
      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');

      const res = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie }
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('renders the admin page with the expected HTML structure', async () => {
      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');

      const res = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie }
      });

      expect(res.body).toContain('Taktos Admin Control Center');
      expect(res.body).toContain('User Management');
      expect(res.body).toContain('Event Throughput');
    });

    it('displays the signed-in admin email in the page body', async () => {
      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');

      const res = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie }
      });

      expect(res.body).toContain(TEST_ADMIN_EMAIL);
    });

    it('returns 200 with god=1 query param (exercises god-mode code path)', async () => {
      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');

      const res = await app.inject({
        method: 'GET',
        url: '/admin?god=1',
        headers: { cookie }
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Disable');
    });

    it('returns 200 with a search query param (exercises user search SQL path)', async () => {
      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');

      const res = await app.inject({
        method: 'GET',
        url: '/admin?q=test',
        headers: { cookie }
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /admin — access control', () => {
    it('returns 403 for a logged-in non-admin user', async () => {
      const cookie = makeCookie(app, nonAdminUserId, TEST_USER_EMAIL, 'jobseeker');

      const res = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie }
      });

      expect(res.statusCode).toBe(403);
    });

    it('returns 302 redirect to login when no cookie is present', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin'
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers['location']).toMatch(/\/html\/login/);
    });

    it('returns 302 redirect to login when cookie contains an invalid JWT', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie: 'takt_jwt=not-a-valid-jwt' }
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers['location']).toMatch(/\/html\/login/);
    });

    it('returns 302 redirect to login when cookie contains a JWT signed with the wrong secret', async () => {
      // Build a token with a different secret — simulate a forged/stale token
      const fakeToken = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT' })
      ).toString('base64url') +
        '.' +
        Buffer.from(
          JSON.stringify({ userId: adminUserId, email: TEST_ADMIN_EMAIL, role: 'admin' })
        ).toString('base64url') +
        '.fakesignature';

      const res = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie: `takt_jwt=${encodeURIComponent(fakeToken)}` }
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers['location']).toMatch(/\/html\/login/);
    });
  });

  describe('GET /admin — blocked user', () => {
    it('redirects to login when the admin user is blocked', async () => {
      // Block the admin user temporarily
      await pool.query(
        `INSERT INTO admin_user_blocks (user_id, blocked_by_user_id, reason, blocked_at, unblocked_at)
         VALUES ($1, $1, 'test block', NOW(), NULL)
         ON CONFLICT (user_id) DO UPDATE SET unblocked_at = NULL`,
        [adminUserId]
      );

      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');

      const res = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie }
      });

      // Unblock immediately so other tests are unaffected
      await pool.query(
        `UPDATE admin_user_blocks SET unblocked_at = NOW() WHERE user_id = $1`,
        [adminUserId]
      );

      expect(res.statusCode).toBe(302);
      expect(res.headers['location']).toMatch(/\/html\/login/);
    });
  });

  describe('GET /admin — XSS protection', () => {
    it('escapes the notice query parameter in the page output', async () => {
      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');
      const xssPayload = '<script>alert(1)</script>';

      const res = await app.inject({
        method: 'GET',
        url: `/admin?notice=${encodeURIComponent(xssPayload)}`,
        headers: { cookie }
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('<script>alert(1)</script>');
      expect(res.body).toContain('&lt;script&gt;');
    });

    it('escapes the q search query parameter in the page output', async () => {
      const cookie = makeCookie(app, adminUserId, TEST_ADMIN_EMAIL, 'admin');
      const xssPayload = '"><img src=x onerror=alert(1)>';

      const res = await app.inject({
        method: 'GET',
        url: `/admin?q=${encodeURIComponent(xssPayload)}`,
        headers: { cookie }
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('"><img src=x onerror=alert(1)>');
    });
  });
});
