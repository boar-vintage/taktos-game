import crypto from 'node:crypto';

export interface SignedLinkInput {
  userId: string;
  action: string;
  params: Record<string, string>;
  exp: number;
  secret: string;
}

function canonicalParams(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] ?? '')}`)
    .join('&');
}

export function createSignedActionToken(input: SignedLinkInput): string {
  const payload = `${input.userId}|${input.action}|${canonicalParams(input.params)}|${input.exp}`;
  return crypto.createHmac('sha256', input.secret).update(payload).digest('hex');
}

export function verifySignedActionToken(input: SignedLinkInput & { sig: string; nowEpochSec?: number }): boolean {
  const nowEpochSec = input.nowEpochSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(input.exp) || input.exp < nowEpochSec) {
    return false;
  }

  const expected = createSignedActionToken(input);
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(input.sig, 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function buildSignedPath(input: {
  path: string;
  userId: string;
  action: string;
  params: Record<string, string>;
  secret: string;
  ttlSeconds?: number;
}): string {
  const exp = Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 60);
  const sig = createSignedActionToken({
    userId: input.userId,
    action: input.action,
    params: input.params,
    exp,
    secret: input.secret
  });

  const search = new URLSearchParams({ ...input.params, exp: String(exp), sig }).toString();
  return `${input.path}?${search}`;
}
