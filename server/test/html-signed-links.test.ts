import { describe, expect, it } from 'vitest';
import { createSignedActionToken, verifySignedActionToken } from '../src/services/html/signedLinks.js';

describe('signed HTML action links', () => {
  it('accepts valid signatures before expiry', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = createSignedActionToken({
      userId: 'user-1',
      action: 'wave',
      params: { ctx: 'mainstreet', next: '/html/world/core/mainstreet' },
      exp,
      secret: 'secret-1234567890123456'
    });

    const ok = verifySignedActionToken({
      userId: 'user-1',
      action: 'wave',
      params: { ctx: 'mainstreet', next: '/html/world/core/mainstreet' },
      exp,
      sig,
      secret: 'secret-1234567890123456'
    });

    expect(ok).toBe(true);
  });

  it('rejects tampered params', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = createSignedActionToken({
      userId: 'user-1',
      action: 'wave',
      params: { ctx: 'mainstreet', next: '/html/world/core/mainstreet' },
      exp,
      secret: 'secret-1234567890123456'
    });

    const ok = verifySignedActionToken({
      userId: 'user-1',
      action: 'wave',
      params: { ctx: 'place', next: '/html/world/core/mainstreet' },
      exp,
      sig,
      secret: 'secret-1234567890123456'
    });

    expect(ok).toBe(false);
  });
});
