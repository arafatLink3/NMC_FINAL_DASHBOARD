/**
 * @nmc/server — Azure AD / Entra ID OpenID Connect client.
 *
 * No `@azure/msal-node` dependency — we implement just enough OIDC to
 *   1. build the authorize URL (`/authorize`)
 *   2. exchange the auth code for tokens (`/token`)
 *   3. verify the id_token signature against the JWKS
 *
 * This keeps the server pure-JS / portable and works with personal
 * Microsoft accounts and any Azure AD tenant.
 */
import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto';
import type { Config } from '../../config.js';

export interface AzureProfile {
  /** Stable subject id from the `sub` claim (immutable per tenant). */
  oid: string;
  /** Tenant id. */
  tid: string;
  /** UPN / email. */
  preferred_username: string;
  /** Display name (or empty). */
  name: string;
  /** Raw claims for callers that need more. */
  claims: Record<string, unknown>;
}

export interface AzureAuthClient {
  readonly enabled: boolean;
  /** Build the URL the browser should be redirected to. */
  buildAuthorizeUrl(state: string, nonce: string): string;
  /** Exchange a one-time auth code for the id_token. */
  exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<AzureProfile>;
}

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomState(): string {
  return b64url(randomBytes(32));
}

function randomVerifier(): string {
  // RFC 7636 — code_verifier is 43-128 chars from the unreserved set.
  return b64url(randomBytes(48));
}

function challengeFor(verifier: string): string {
  // S256: BASE64URL(SHA256(verifier))
  return b64url(createHash('sha256').update(verifier).digest());
}

export function createAzureAuthClient(config: Config): AzureAuthClient {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_REDIRECT_URI } = config;
  const enabled = Boolean(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);
  if (!enabled) {
    return {
      enabled: false,
      buildAuthorizeUrl: () => {
        throw new Error('azure_ad_disabled');
      },
      exchangeCode: async () => {
        throw new Error('azure_ad_disabled');
      },
    };
  }

  const authorizeEndpoint = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/authorize`;
  const tokenEndpoint = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const jwksUri = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys`;

  return {
    enabled: true,

    buildAuthorizeUrl(state: string, nonce: string): string {
      const params = new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        response_type: 'code',
        redirect_uri: AZURE_REDIRECT_URI,
        response_mode: 'query',
        scope: SCOPES.join(' '),
        state,
        nonce,
      });
      return `${authorizeEndpoint}?${params.toString()}`;
    },

    async exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<AzureProfile> {
      const body = new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        client_secret: config.AZURE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: AZURE_REDIRECT_URI,
        code_verifier: codeVerifier,
        scope: SCOPES.join(' '),
      });
      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text();
        throw new Error(`token_exchange_failed:${tokenRes.status}:${detail.slice(0, 200)}`);
      }
      const tokenJson = (await tokenRes.json()) as {
        id_token?: string;
        access_token?: string;
      };
      if (!tokenJson.id_token) {
        throw new Error('token_exchange_missing_id_token');
      }
      const claims = await verifyIdToken(tokenJson.id_token, jwksUri, AZURE_TENANT_ID, AZURE_CLIENT_ID, nonce);
      return {
        oid: String(claims.oid ?? claims.sub ?? ''),
        tid: String(claims.tid ?? AZURE_TENANT_ID),
        preferred_username: String(claims.preferred_username ?? claims.email ?? claims.upn ?? ''),
        name: String(claims.name ?? ''),
        claims: claims as Record<string, unknown>,
      };
    },
  };
}

// --- internals: id_token verification -----------------------------------

interface Jwk {
  kid: string;
  n?: string;
  e?: string;
  kty: string;
  alg?: string;
  use?: string;
  x5c?: string[];
}

interface JwkSet {
  keys: Jwk[];
}

interface JwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface JwtPayload {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat: number;
  nonce?: string;
  oid?: string;
  tid?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  name?: string;
  [k: string]: unknown;
}

let _jwksCache: { uri: string; set: JwkSet; fetchedAt: number } | null = null;

async function getJwks(uri: string): Promise<JwkSet> {
  // 10-minute cache so we don't hammer Microsoft on every callback.
  if (_jwksCache && _jwksCache.uri === uri && Date.now() - _jwksCache.fetchedAt < 10 * 60_000) {
    return _jwksCache.set;
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`jwks_fetch_failed:${res.status}`);
  const set = (await res.json()) as JwkSet;
  _jwksCache = { uri, set, fetchedAt: Date.now() };
  return set;
}

function verifyRsaSha256(input: Buffer, signature: Buffer, jwk: Jwk): boolean {
  if (!jwk.n || !jwk.e) throw new Error('jwk_missing_rsa_params');
  // Build a DER-encoded SubjectPublicKeyInfo from (n, e) so node:crypto
  // accepts the key without us having to import `node-forge` or `jose`.
  const key = createPublicKey({ key: jwkToPem(jwk), format: 'pem' });
  // node:crypto's Verify API is the most portable across Node versions.
  const verifier = createVerify('RSA-SHA256');
  verifier.update(input);
  verifier.end();
  return verifier.verify(key, signature);
}

function jwkToPem(jwk: Jwk): string {
  const n = Buffer.from(jwk.n ?? '', 'base64url');
  const e = Buffer.from(jwk.e ?? '', 'base64url');
  // Minimal RSAPublicKey DER wrapper.
  const inner = derSequence(Buffer.concat([derInteger(n), derInteger(e)]));
  const spki = derSequence(Buffer.concat([derAlgorithmId(), derBitString(inner)]));
  const b64 = spki.toString('base64');
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function derInteger(buf: Buffer): Buffer {
  // Prepend 0x00 if high bit is set so the integer is positive.
  const pad = buf[0]! & 0x80 ? Buffer.from([0x00]) : Buffer.alloc(0);
  return derTagged(0x02, Buffer.concat([pad, buf]));
}

function derBitString(buf: Buffer): Buffer {
  return derTagged(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function derSequence(buf: Buffer): Buffer {
  return derTagged(0x30, buf);
}

function derTagged(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

function derLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derAlgorithmId(): Buffer {
  // 1.2.840.113549.1.1.1 (rsaEncryption) — DER-encoded OID.
  const oidBytes = Buffer.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  return derSequence(oidBytes);
}

async function verifyIdToken(
  idToken: string,
  jwksUri: string,
  tenantId: string,
  clientId: string,
  nonce: string,
): Promise<JwtPayload> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('id_token_malformed');
  const [h, p, s] = parts as [string, string, string];
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as JwtHeader;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as JwtPayload;
  const sig = Buffer.from(s, 'base64url');

  if (header.alg !== 'RS256') throw new Error(`unsupported_alg:${header.alg}`);
  if (payload.aud !== clientId) throw new Error('aud_mismatch');
  if (payload.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0` &&
      payload.iss !== `https://sts.windows.net/${tenantId}/`) {
    throw new Error(`iss_mismatch:${payload.iss}`);
  }
  if (typeof payload.nonce !== 'string' || payload.nonce !== nonce) {
    throw new Error('nonce_mismatch');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) throw new Error('id_token_expired');

  const jwks = await getJwks(jwksUri);
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`kid_not_found:${header.kid}`);

  const ok = verifyRsaSha256(Buffer.from(`${h}.${p}`), sig, jwk);
  if (!ok) throw new Error('signature_invalid');
  return payload;
}

// --- exports for tests ----------------------------------------------------

export const __internal = { randomState, randomVerifier, challengeFor };
