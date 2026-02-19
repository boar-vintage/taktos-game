import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export const HTML_JWT_COOKIE = 'takt_jwt';

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!header) {
    return parsed;
  }

  for (const chunk of header.split(';')) {
    const trimmed = chunk.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    parsed[key] = decodeURIComponent(value);
  }

  return parsed;
}

export function readJwtCookie(request: FastifyRequest): string | null {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[HTML_JWT_COOKIE] ?? null;
}

export function buildJwtCookie(value: string, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  return `${HTML_JWT_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function buildClearedJwtCookie(): string {
  return `${HTML_JWT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function redirectToLogin(reply: FastifyReply, next: string): void {
  reply.code(302).header('Location', `/html/login?next=${encodeURIComponent(next)}`).send();
}

export async function authenticateHtmlCookie(input: {
  app: FastifyInstance;
  request: FastifyRequest;
  reply: FastifyReply;
}): Promise<boolean> {
  const token = readJwtCookie(input.request);
  if (!token) {
    redirectToLogin(input.reply, input.request.url);
    return false;
  }

  try {
    const payload = input.app.jwt.verify<{
      userId: string;
      email: string;
      role: string;
    }>(token);

    (input.request as FastifyRequest & {
      user: { userId: string; email: string; role: string };
    }).user = payload;
    return true;
  } catch {
    redirectToLogin(input.reply, input.request.url);
    return false;
  }
}
