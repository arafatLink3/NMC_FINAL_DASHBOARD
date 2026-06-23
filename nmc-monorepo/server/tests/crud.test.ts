import { describe, it, expect } from 'vitest';
import { makeHarness, teardown } from './helpers.js';

describe('domain CRUD', () => {
  it('lists + paginates tickets, with search/zone/status filters', async () => {
    const h = await makeHarness();
    try {
      await h.seedAdmin('admin', 'pw');
      const token = await h.login('admin', 'pw');
      for (let i = 0; i < 5; i++) {
        await h.app.inject({
          method: 'POST',
          url: '/api/tickets',
          headers: { authorization: `Bearer ${token}` },
          payload: {
            zone: i % 2 ? 'Z1' : 'Z2',
            status: 'open',
            data: { subject: `Ticket ${i}`, i },
          },
        });
      }
      const all = await h.app.inject({
        method: 'GET',
        url: '/api/tickets?limit=10',
      });
      const allBody = all.json() as { rows: unknown[]; total: number };
      expect(allBody.total).toBe(5);

      const z1 = await h.app.inject({
        method: 'GET',
        url: '/api/tickets?zone=Z1',
      });
      const z1Body = z1.json() as { total: number };
      expect(z1Body.total).toBe(2); // 1,3 (i=0 is Z2, i=2 is Z2, i=4 is Z2)

      const search = await h.app.inject({
        method: 'GET',
        url: '/api/tickets?search=Ticket%202',
      });
      const searchBody = search.json() as { total: number };
      expect(searchBody.total).toBe(1);
    } finally {
      await teardown(h);
    }
  });

  it('fuzzy search across contacts data column', async () => {
    const h = await makeHarness();
    try {
      await h.seedAdmin('admin', 'pw');
      const token = await h.login('admin', 'pw');
      for (const name of ['Alice Cooper', 'Bob Marley', 'Carol Danvers']) {
        await h.app.inject({
          method: 'POST',
          url: '/api/contacts',
          headers: { authorization: `Bearer ${token}` },
          payload: { data: { name }, zone: 'Z1' },
        });
      }
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/contacts/search',
        payload: { query: 'Bob' },
      });
      const body = res.json() as { rows: { data: string | { name: string } }[] };
      expect(body.rows.length).toBe(1);
      const d = body.rows[0]!.data;
      const name = typeof d === 'string' ? JSON.parse(d).name : d.name;
      expect(name).toBe('Bob Marley');
    } finally {
      await teardown(h);
    }
  });

  it('records a sent mail message', async () => {
    const h = await makeHarness();
    try {
      await h.seedAdmin('admin', 'pw');
      const token = await h.login('admin', 'pw');
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/mail/send',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          to: 'a@b.test',
          subject: 'hello',
          body: 'world',
        },
      });
      expect(res.statusCode).toBe(201);
    } finally {
      await teardown(h);
    }
  });
});