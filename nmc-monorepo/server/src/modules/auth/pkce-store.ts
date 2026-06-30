/**
 * @nmc/server — short-lived PKCE / state store backed by `auth_pkce`.
 *
 * The web SPA calls `/api/auth/azure/start`, the server writes a row
 * with the freshly minted `state`, `nonce`, and `code_verifier`, and
 * returns the authorize URL. The Azure redirect back to
 * `/api/auth/azure/callback` carries the same `state` so we can look
 * up the row, exchange the auth code, and (optionally) issue a JWT.
 */
import type { Knex } from 'knex';

export interface PkceEntry {
  state: string;
  code_verifier: string;
  nonce: string;
  return_to: string | null;
  created_at: string;
}

export class PkceStore {
  private readonly ttlMs = 10 * 60_000; // 10 minutes

  constructor(private readonly db: Knex) {}

  async put(entry: Omit<PkceEntry, 'created_at'>): Promise<void> {
    await this.db('auth_pkce').insert({
      state: entry.state,
      code_verifier: entry.code_verifier,
      nonce: entry.nonce,
      return_to: entry.return_to,
    });
    // Best-effort cleanup of expired rows.
    await this.cleanup();
  }

  async take(state: string): Promise<PkceEntry | null> {
    const row = await this.db<PkceEntry>('auth_pkce').where({ state }).first();
    if (!row) return null;
    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > this.ttlMs) {
      await this.db('auth_pkce').where({ state }).del();
      return null;
    }
    // One-shot: delete after read so the state cannot be replayed.
    await this.db('auth_pkce').where({ state }).del();
    return row;
  }

  async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - this.ttlMs).toISOString();
    await this.db('auth_pkce').where('created_at', '<', cutoff).del();
  }
}
