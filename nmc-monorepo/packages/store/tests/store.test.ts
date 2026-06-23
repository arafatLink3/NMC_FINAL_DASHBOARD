import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalStore, localStorageAdapter, PREFIX } from '../src/index.js';

beforeEach(() => {
  globalThis.localStorage?.clear();
});

afterEach(() => {
  globalThis.localStorage?.clear();
});

describe('localStorageAdapter', () => {
  it('stores and reads back scalars', async () => {
    await localStorageAdapter.set('foo', { a: 1 });
    expect(await localStorageAdapter.get('foo')).toEqual({ a: 1 });
  });

  it('round-trips a typed table', async () => {
    const store = createLocalStore();
    const t = await store.tickets.add({ category: 'BTS Down', currentStatus: 'open' });
    expect(t.id).toBeTypeOf('string');
    expect(t.createdAt).toBeTypeOf('string');
    const list = await store.tickets.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.category).toBe('BTS Down');
  });

  it('updates a record by id', async () => {
    const store = createLocalStore();
    const t = await store.tickets.add({ category: 'BTS Down', currentStatus: 'open' });
    const updated = await store.tickets.update(t.id, { currentStatus: 'closed' });
    expect(updated?.currentStatus).toBe('closed');
    const fetched = await store.tickets.get(t.id);
    expect(fetched?.currentStatus).toBe('closed');
  });

  it('removes a record by id', async () => {
    const store = createLocalStore();
    const t = await store.tickets.add({ category: 'BTS Down', currentStatus: 'open' });
    await store.tickets.remove(t.id);
    expect(await store.tickets.list()).toHaveLength(0);
  });

  it('uses the nmc. prefix', async () => {
    const store = createLocalStore();
    await store.setRaw('settings', { wa_group: 'grp123' });
    expect(globalThis.localStorage?.getItem(`${PREFIX}settings`)).toBe(JSON.stringify({ wa_group: 'grp123' }));
  });

  it('exports and imports a JSON snapshot', async () => {
    const store = createLocalStore();
    await store.tickets.add({ category: 'OLT Issue' });
    const dump = await store.exportJson();
    expect(dump.tickets).toBeTruthy();
    await store.clearAll();
    expect(await store.tickets.list()).toHaveLength(0);
    await store.importJson(dump);
    expect(await store.tickets.list()).toHaveLength(1);
  });
});
