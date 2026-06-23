import { describe, it, expect } from 'vitest';
import {
  BrasRepository,
  normaliseContact,
} from '../src/modules/bras/repository.js';
import { makeHarness, teardown } from './helpers.js';

describe('BRAS repository', () => {
  it('round-trips a snake_case record', async () => {
    const h = await makeHarness();
    try {
      const repo = new BrasRepository(h.db);
      const created = await repo.create({
        region: 'Central',
        zone: 'Z1',
        station: 'ST-A',
        address: '1 Test Rd',
        vendor: 'Cisco',
        kind: 'ASR9k',
        category: 'core',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        status: 'open',
        contact_prefix: '+234',
        contact_phone: '8012345678',
        contact_dashed: '+234-8012345678',
        contact_email: 'noc@example.test',
        notes: 'unit test',
      });
      expect(created.id).toBeDefined();
      expect(created.status).toBe('open');
      expect(created.contact_dashed).not.toMatch(/^[+-]/);
    } finally {
      await teardown(h);
    }
  });

  it('strips leading + and - from contact_dashed', () => {
    const row = normaliseContact({ contact_dashed: '-234-8012345678' });
    expect(row.contact_dashed).toBe('234-8012345678');
  });

  it('filters by zone, status, category and search', async () => {
    const h = await makeHarness();
    try {
      const repo = new BrasRepository(h.db);
      await repo.create({
        region: 'N', zone: 'Z1', station: 'A', address: 'a',
        vendor: 'Cisco', kind: 'ASR', category: 'core',
        period_start: '2026-06-01', period_end: '2026-06-30',
        status: 'open', contact_prefix: null, contact_phone: null,
        contact_dashed: null, contact_email: null, notes: 'alpha',
      });
      await repo.create({
        region: 'S', zone: 'Z2', station: 'B', address: 'b',
        vendor: 'Juniper', kind: 'MX', category: 'edge',
        period_start: '2026-06-01', period_end: '2026-06-30',
        status: 'closed', contact_prefix: null, contact_phone: null,
        contact_dashed: null, contact_email: null, notes: 'beta',
      });

      const z1 = await repo.search({ zone: 'Z1' });
      expect(z1.total).toBe(1);
      expect(z1.rows[0]?.zone).toBe('Z1');

      const closed = await repo.search({ status: 'closed' });
      expect(closed.total).toBe(1);

      const searched = await repo.search({ search: 'alpha' });
      expect(searched.total).toBe(1);

      const empty = await repo.search({ category: 'core' });
      expect(empty.total).toBe(1);
    } finally {
      await teardown(h);
    }
  });

  it('updates + deletes by id', async () => {
    const h = await makeHarness();
    try {
      const repo = new BrasRepository(h.db);
      const created = await repo.create({
        region: 'R', zone: 'Z', station: 'S', address: 'A',
        vendor: 'V', kind: 'K', category: 'C',
        period_start: '2026-01-01', period_end: '2026-01-31',
        status: 'open', contact_prefix: null, contact_phone: null,
        contact_dashed: null, contact_email: null, notes: null,
      });
      const id = created.id!;
      const updated = await repo.update(id, { status: 'closed' });
      expect(updated?.status).toBe('closed');
      const removed = await repo.remove(id);
      expect(removed).toBe(1);
      const after = await repo.byId(id);
      expect(after).toBeNull();
    } finally {
      await teardown(h);
    }
  });
});