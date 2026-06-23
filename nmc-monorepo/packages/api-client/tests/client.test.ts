import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, bindEndpoints, MemoryTokenStorage } from '../src/index.js';

function makeFetchOk<T>(body: T, status = 200): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('ApiClient', () => {
  it('sends Authorization header when a token is stored', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const tokens = new MemoryTokenStorage();
    await tokens.setAccessToken('test.jwt.token');
    const c = new ApiClient({ baseUrl: 'http://x', tokenStorage: tokens, fetchImpl });
    await c.get('/api/foo');
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: 'Bearer test.jwt.token' });
  });

  it('stringifies JSON bodies', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const c = new ApiClient({ baseUrl: 'http://x', fetchImpl });
    await c.post('/api/foo', { a: 1 });
    const init = (fetchImpl as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0]?.[1];
    expect(init?.body).toBe('{"a":1}');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('passes FormData through without stringifying', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    const c = new ApiClient({ baseUrl: 'http://x', fetchImpl });
    const fd = new FormData();
    fd.append('file', new Blob(['x']), 'a.csv');
    await c.post('/api/bras/import', fd);
    const init = (fetchImpl as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0]?.[1];
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('throws ApiError on non-2xx', async () => {
    const c = new ApiClient({
      baseUrl: 'http://x',
      fetchImpl: makeFetchOk({ code: 'E1', message: 'nope' }, 400),
    });
    await expect(c.get('/api/foo')).rejects.toBeInstanceOf(ApiError);
    try { await c.get('/api/foo'); }
    catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(400);
      expect(err.code).toBe('E1');
      expect(err.message).toBe('nope');
    }
  });

  it('retries once after a successful 401-refresh', async () => {
    const tokens = new MemoryTokenStorage();
    await tokens.setRefreshToken('rt-1');
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === 'Bearer rt-1') {
        return new Response(JSON.stringify({ accessToken: 'new', refreshToken: 'new-r', expiresInSec: 60 }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (auth === 'Bearer new') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('unauth', { status: 401 });
    }) as unknown as typeof fetch;

    const c = new ApiClient({
      baseUrl: 'http://x',
      tokenStorage: tokens,
      fetchImpl,
      refresh: async () => ({ accessToken: 'new', refreshToken: 'new-r', expiresInSec: 60 }),
    });
    const res = await c.get('/api/foo');
    expect(res).toEqual({ ok: true });
    expect(await tokens.getAccessToken()).toBe('new');
  });
});

describe('bindEndpoints', () => {
  it('exposes the expected surface', () => {
    const c = new ApiClient({ baseUrl: 'http://x', fetchImpl: makeFetchOk({}) });
    const api = bindEndpoints(c);
    for (const k of [
      'login', 'logout', 'refresh', 'me',
      'parseTicket', 'classify', 'rules', 'rosterAt',
      'listTickets', 'createTicket', 'updateTicket', 'deleteTicket',
      'listIncidents', 'createIncident', 'updateIncident', 'deleteIncident',
      'listContacts', 'searchContacts', 'learnContact',
      'listBras', 'importBras', 'exportBrasCsv',
      'listNms', 'upsertNms', 'deleteNms',
      'listRoster', 'createRoster', 'updateRoster', 'deleteRoster',
      'listScr', 'createScr', 'updateScr', 'deleteScr',
      'listCcb', 'createCcb', 'updateCcb', 'deleteCcb',
      'listMailLog', 'sendMail',
      'getSettings', 'updateSettings',
    ]) {
      expect(api).toHaveProperty(k);
    }
  });
});
