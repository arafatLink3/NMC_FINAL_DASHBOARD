/**
 * Core HTTP client. Isomorphic (browser + Node 20+ via undici + RN via
 * `react-native`'s WHATWG fetch). All calls go through `request()` so we
 * can centralise:
 *   • base URL + JSON handling
 *   • access-token injection
 *   • 401-triggered refresh + retry
 *   • error normalisation (`ApiError`)
 */

import { ApiError } from './errors.js';
import { MemoryTokenStorage, type TokenStorage } from './storage.js';

export interface CreateClientOptions {
  baseUrl: string;                       // e.g. 'https://api.nmc.example.com' or '/api'
  tokenStorage?: TokenStorage;
  /** Extra headers for every request (e.g. tracing). */
  headers?: Record<string, string>;
  /** Refresh handler — typically POSTs to /api/auth/refresh. */
  refresh?: (refreshToken: string) => Promise<{ accessToken: string; refreshToken?: string; expiresInSec: number }>;
  /** Called after a successful refresh. */
  onAuthChange?: (event: { type: 'login' | 'logout' | 'refresh'; accessToken?: string }) => void;
  /** Default timeout per request (ms). 0 = no timeout. */
  timeoutMs?: number;
  /** fetch override (e.g. for tests). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  readonly baseUrl: string;
  readonly tokenStorage: TokenStorage;
  private readonly headers: Record<string, string>;
  private readonly refresh?: CreateClientOptions['refresh'];
  private readonly onAuthChange?: CreateClientOptions['onAuthChange'];
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private inflightRefresh: Promise<string | null> | null = null;

  constructor(opts: CreateClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.tokenStorage = opts.tokenStorage ?? new MemoryTokenStorage();
    this.headers = opts.headers ?? {};
    this.refresh = opts.refresh;
    this.onAuthChange = opts.onAuthChange;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch?.bind(globalThis) as typeof fetch);
    if (!this.fetchImpl) {
      throw new Error('@nmc/api-client: no fetch implementation available. Pass `fetchImpl`.');
    }
  }

  /** Lower-level request. Most callers use the higher-level methods. */
  async request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
    const url = this.buildUrl(path);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...this.headers,
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    };
    if (body !== undefined && headers['Content-Type'] === undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const token = await this.tokenStorage.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const fetchInit: RequestInit = {
      method,
      headers,
      ...(body === undefined
        ? {}
        : body instanceof FormData
          ? { body }
          : { body: JSON.stringify(body) }),
      ...init,
    };

    const retried = (init as (RequestInit & { _retried?: boolean }) | undefined)?._retried === true;
    let res = await this.doFetch(url, fetchInit);

    // 401 → try one refresh + retry
    if (res.status === 401 && this.refresh && !retried) {
      const newToken = await this.refreshTokens();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        const retryInit: RequestInit & { _retried: boolean } = { ...fetchInit, headers, _retried: true };
        res = await this.doFetch(url, retryInit);
      }
    }

    return this.handle<T>(res);
  }

  /** Escape hatch: raw fetch (for CSV exports, etc.) that bypasses the JSON envelope. */
  async fetchRaw(path: string, init?: RequestInit): Promise<Response> {
    const url = this.buildUrl(path);
    const token = await this.tokenStorage.getAccessToken();
    const headers: Record<string, string> = { ...this.headers, ...((init?.headers as Record<string, string> | undefined) ?? {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return this.doFetch(url, { ...init, headers });
  }

  get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', this.appendQuery(path, query));
  }
  post<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PUT', path, body); }
  patch<T>(path: string, body?: unknown): Promise<T> { return this.request<T>('PATCH', path, body); }
  delete<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>('DELETE', this.appendQuery(path, query));
  }

  // ─── private helpers ──────────────────────────────────────────────────

  private buildUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${p}`;
  }

  private appendQuery(path: string, query?: Record<string, unknown>): string {
    if (!query) return path;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach(x => usp.append(k, String(x)));
      else usp.append(k, String(v));
    }
    const qs = usp.toString();
    return qs ? `${path}?${qs}` : path;
  }

  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    if (this.timeoutMs <= 0) return this.fetchImpl(url, init);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: init.signal ?? ac.signal });
    } finally { clearTimeout(t); }
  }

  private async handle<T>(res: Response): Promise<T> {
    const text = await res.text();
    const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
    const payload: unknown = isJson && text ? safeJson(text) : text;
    if (res.ok) return payload as T;

    if (res.status === 0) throw ApiError.network('Network error');
    const errPayload = (payload && typeof payload === 'object') ? (payload as Record<string, unknown>) : {};
    throw new ApiError({
      status: res.status,
      code: typeof errPayload['code'] === 'string' ? (errPayload['code'] as string) : undefined,
      message: typeof errPayload['message'] === 'string'
        ? (errPayload['message'] as string)
        : `HTTP ${res.status} ${res.statusText}`,
      details: errPayload['details'] ?? payload,
    });
  }

  private async refreshTokens(): Promise<string | null> {
    if (!this.refresh) return null;
    if (this.inflightRefresh) return this.inflightRefresh;
    const rt = await this.tokenStorage.getRefreshToken();
    if (!rt) return null;
    this.inflightRefresh = (async () => {
      try {
        const r = await this.refresh!(rt);
        await this.tokenStorage.setAccessToken(r.accessToken);
        if (r.refreshToken) await this.tokenStorage.setRefreshToken(r.refreshToken);
        this.onAuthChange?.({ type: 'refresh', accessToken: r.accessToken });
        return r.accessToken;
      } catch {
        await this.tokenStorage.clear();
        this.onAuthChange?.({ type: 'logout' });
        return null;
      } finally {
        this.inflightRefresh = null;
      }
    })();
    return this.inflightRefresh;
  }
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

/** Convenience factory. */
export function createClient(opts: CreateClientOptions): ApiClient {
  return new ApiClient(opts);
}
