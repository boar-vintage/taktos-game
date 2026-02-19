import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/pool.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })
  }
}));

import { pool } from '../src/db/pool.js';
import { markHtmlPresenceOnline } from '../src/services/html/presence.js';

describe('html presence updates', () => {
  it('updates world/place on page load presence touch', async () => {
    await markHtmlPresenceOnline({
      userId: 'f2f7b708-91ec-42ba-8281-5f156179f8f0',
      worldId: '529b8a8c-f8a3-4a56-a0f9-a6d3b1f7f7c2',
      placeId: null
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO presence'), [
      'f2f7b708-91ec-42ba-8281-5f156179f8f0',
      '529b8a8c-f8a3-4a56-a0f9-a6d3b1f7f7c2',
      null
    ]);
  });
});
