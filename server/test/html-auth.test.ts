import { describe, expect, it, vi } from 'vitest';
import { authenticateHtmlCookie } from '../src/services/html/auth.js';

describe('html cookie auth middleware', () => {
  it('redirects to /html/login when cookie is missing', async () => {
    const reply = {
      status: 200,
      headers: {} as Record<string, string>,
      sent: false,
      code(value: number) {
        this.status = value;
        return this;
      },
      header(key: string, value: string) {
        this.headers[key] = value;
        return this;
      },
      send() {
        this.sent = true;
        return this;
      }
    };

    const ok = await authenticateHtmlCookie({
      app: { jwt: { verify: vi.fn() } } as any,
      request: { headers: {}, url: '/html' } as any,
      reply: reply as any
    });

    expect(ok).toBe(false);
    expect(reply.status).toBe(302);
    expect(reply.headers.Location).toContain('/html/login');
  });

  it('sets request.user when cookie JWT is valid', async () => {
    const verify = vi.fn().mockReturnValue({ userId: 'u1', email: 'u@example.com', role: 'jobseeker' });
    const request: any = {
      headers: { cookie: 'takt_jwt=abc123' },
      url: '/html/world/core/mainstreet'
    };

    const ok = await authenticateHtmlCookie({
      app: { jwt: { verify } } as any,
      request,
      reply: {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
      } as any
    });

    expect(ok).toBe(true);
    expect(verify).toHaveBeenCalledWith('abc123');
    expect(request.user.userId).toBe('u1');
  });
});
