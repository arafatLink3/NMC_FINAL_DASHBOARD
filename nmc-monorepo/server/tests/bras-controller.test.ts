import { describe, it, expect } from 'vitest';
import { makeHarness, teardown } from './helpers.js';

describe('BRAS controller', () => {
  it('searches with snake_case params and returns snake_case rows', async () => {
    const h = await makeHarness();
    try {
      await h.seedAdmin('admin', 'pw');
      const token = await h.login('admin', 'pw');

      await h.app.inject({
        method: 'POST',
        url: '/api/bras',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          region: 'Central', zone: 'Z1', station: 'A', address: 'a',
          vendor: 'Cisco', kind: 'ASR9k', category: 'core',
          period_start: '2026-06-01', period_end: '2026-06-30',
          status: 'open', contact_prefix: '+234', contact_phone: '8012345678',
          contact_dashed: '+234-8012345678', contact_email: 'x@y.z', notes: 'n',
        },
      });

      const res = await h.app.inject({
        method: 'GET',
        url: '/api/bras/search?zone=Z1&status=open&category=core&fromDate=2026-01-01&toDate=2026-12-31',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { rows: Record<string, unknown>[]; total: number };
      expect(body.total).toBe(1);
      const row = body.rows[0]!;
      expect(row).toHaveProperty('contact_prefix');
      expect(row).toHaveProperty('contact_phone');
      expect(row).toHaveProperty('contact_dashed');
      expect(row).toHaveProperty('period_start');
      expect(String(row.contact_dashed)).not.toMatch(/^[+-]/);
    } finally {
      await teardown(h);
    }
  });

  it('rejects bad id with 400', async () => {
    const h = await makeHarness();
    try {
      const res = await h.app.inject({
        method: 'GET',
        url: '/api/bras/notanumber',
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await teardown(h);
    }
  });
});