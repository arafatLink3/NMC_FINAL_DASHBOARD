import { describe, it, expect } from 'vitest';
import { makeHarness, teardown } from './helpers.js';

describe('AI proxy', () => {
  it('parses a contact line', async () => {
    const h = await makeHarness();
    try {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/ai/parse-contact',
        payload: { text: 'Alice Cooper, +234-8012345678, alice@example.test' },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await teardown(h);
    }
  });

  it('rejects bad input', async () => {
    const h = await makeHarness();
    try {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/ai/parse-contact',
        payload: { text: '' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await teardown(h);
    }
  });
});