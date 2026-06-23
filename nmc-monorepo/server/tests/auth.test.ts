import { describe, it, expect } from 'vitest';
import { makeHarness, teardown } from './helpers.js';

describe('auth', () => {
  it('issues a JWT for a valid admin', async () => {
    const h = await makeHarness();
    try {
      await h.seedAdmin('alice', 'secret1');
      const token = await h.login('alice', 'secret1');
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const res = await h.app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { user: { username: string; role: string } };
      expect(body.user.username).toBe('alice');
      expect(body.user.role).toBe('admin');
    } finally {
      await teardown(h);
    }
  });

  it('rejects a bad password with 401', async () => {
    const h = await makeHarness();
    try {
      await h.seedAdmin('bob', 'right');
      const res = await h.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: 'bob', password: 'wrong' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await teardown(h);
    }
  });

  it('blocks unauthenticated writes on BRAS', async () => {
    const h = await makeHarness();
    try {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/bras',
        payload: {
          region: 'r', zone: 'z', station: 's', address: 'a',
          vendor: 'v', kind: 'k', category: 'c',
          period_start: '2026-01-01', period_end: '2026-01-31',
          status: 'open', contact_prefix: null, contact_phone: null,
          contact_dashed: null, contact_email: null, notes: null,
        },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await teardown(h);
    }
  });

  it('forbids an operator from deleting BRAS rows', async () => {
    const h = await makeHarness();
    try {
      await h.seedAdmin('admin', 'pw');
      // operator user
      const { hashPassword } = await import('../src/auth.js');
      await h.db('users').insert({
        username: 'op',
        password_hash: await hashPassword('pw'),
        role: 'operator',
      });
      const opToken = await h.login('op', 'pw');

      // create a row as admin
      const adminToken = await h.login('admin', 'pw');
      const created = await h.app.inject({
        method: 'POST',
        url: '/api/bras',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          region: 'r', zone: 'z', station: 's', address: 'a',
          vendor: 'v', kind: 'k', category: 'c',
          period_start: '2026-01-01', period_end: '2026-01-31',
          status: 'open', contact_prefix: null, contact_phone: null,
          contact_dashed: null, contact_email: null, notes: null,
        },
      });
      const id = (created.json() as { id: number }).id;

      const del = await h.app.inject({
        method: 'DELETE',
        url: `/api/bras/${id}`,
        headers: { authorization: `Bearer ${opToken}` },
      });
      expect(del.statusCode).toBe(403);
    } finally {
      await teardown(h);
    }
  });
});