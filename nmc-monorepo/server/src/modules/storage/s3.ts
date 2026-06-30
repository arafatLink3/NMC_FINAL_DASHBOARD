/**
 * @nmc/server — S3-compatible object storage client.
 *
 * Implements the small subset of the S3 API we need against MinIO
 * (or any AWS-S3-compatible endpoint) using fetch + AWS Signature V4.
 * No `@aws-sdk/*` deps; the surface here is tiny:
 *   - put(key, body, contentType) → returns the public URL
 *   - delete(key)
 *   - presignedGetUrl(key, ttl)   → for "Download" buttons
 *
 * The class is a no-op when S3_ENDPOINT is empty (returns null /
 * throws NotConfigured), mirroring the lazy-init pattern used by
 * Mailer / MailFetcher so the server boots without a MinIO host.
 */
import { createHash, createHmac } from 'node:crypto';
import type { Config } from '../../config.js';

export interface PutResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export class ObjectStorage {
  constructor(private readonly config: Config) {}

  get enabled(): boolean {
    return Boolean(this.config.S3_ENDPOINT);
  }

  /** Generate the S3 V4 signing key for a single request. */
  private signingKey(date: string, scope: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${this.config.S3_SECRET_KEY}`).update(date).digest();
    const kRegion = createHmac('sha256', kDate).update(this.config.S3_REGION).digest();
    const kScope = createHmac('sha256', kRegion).update(scope).digest();
    return createHmac('sha256', kScope).update('aws4_request').digest();
  }

  /** Sign a single canonical request and return the Authorization header. */
  private sign(opts: {
    method: string;
    canonicalUri: string;
    canonicalQuery: string;
    payloadHash: string;
    extraHeaders?: Record<string, string>;
    now: Date;
  }): { authorization: string; amzDate: string } {
    const now = opts.now;
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.config.S3_REGION}/s3/aws4_request`;

    const host = new URL(this.config.S3_ENDPOINT).host;
    const baseHeaders: Record<string, string> = {
      host,
      'x-amz-content-sha256': opts.payloadHash,
      'x-amz-date': amzDate,
      ...(opts.extraHeaders ?? {}),
    };
    const sortedHeaderKeys = Object.keys(baseHeaders).sort();
    const canonicalHeaders =
      sortedHeaderKeys.map((k) => `${k}:${baseHeaders[k]}\n`).join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      opts.method,
      opts.canonicalUri,
      opts.canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      opts.payloadHash,
    ].join('\n');

    const credentialScope = scope;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.signingKey(dateStamp, credentialScope);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return {
      authorization:
        `AWS4-HMAC-SHA256 Credential=${this.config.S3_ACCESS_KEY}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      amzDate,
    };
  }

  private endpointUrl(): string {
    const base = this.config.S3_ENDPOINT.replace(/\/$/, '');
    return this.config.S3_FORCE_PATH_STYLE
      ? `${base}/${this.config.S3_BUCKET}`
      : `${base}`;
  }

  /** Build the public URL the browser should use to read the object. */
  private publicUrlFor(key: string): string {
    const base = this.config.S3_PUBLIC_URL
      ? this.config.S3_PUBLIC_URL.replace(/\/$/, '')
      : this.config.S3_ENDPOINT.replace(/\/$/, '');
    const prefix = this.config.S3_FORCE_PATH_STYLE
      ? `${base}/${this.config.S3_BUCKET}`
      : base;
    return `${prefix}/${encodeURI(key)}`;
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<PutResult> {
    if (!this.enabled) throw new Error('storage_disabled');
    const url = this.endpointUrl();
    const canonicalUri = this.config.S3_FORCE_PATH_STYLE
      ? `/${this.config.S3_BUCKET}/${encodeURI(key)}`
      : `/${encodeURI(key)}`;
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const { authorization, amzDate } = this.sign({
      method: 'PUT',
      canonicalUri,
      canonicalQuery: '',
      payloadHash,
      extraHeaders: { 'content-type': contentType },
      now: new Date(),
    });

    const res = await fetch(`${url}/${encodeURI(key)}`, {
      method: 'PUT',
      headers: {
        authorization,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'content-type': contentType,
      },
      body,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`s3_put_failed:${res.status}:${detail.slice(0, 200)}`);
    }
    return { key, url: this.publicUrlFor(key), size: body.length, contentType };
  }

  /**
   * Build a short-lived presigned URL for browser GET. Uses the
   * query-string signing scheme (X-Amz-Signature) rather than the
   * header scheme so we can hand the URL straight to an <a> tag.
   */
  presignedGetUrl(key: string, ttlSeconds = 600): string {
    if (!this.enabled) throw new Error('storage_disabled');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${this.config.S3_REGION}/s3/aws4_request`;
    const host = new URL(this.config.S3_ENDPOINT).host;

    const credential = `${this.config.S3_ACCESS_KEY}/${scope}`;
    const params = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(ttlSeconds),
      'X-Amz-SignedHeaders': 'host',
    });

    const canonicalUri = this.config.S3_FORCE_PATH_STYLE
      ? `/${this.config.S3_BUCKET}/${encodeURI(key)}`
      : `/${encodeURI(key)}`;
    const canonicalQuery = params.toString();

    const canonicalRequest = ['GET', canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.signingKey(dateStamp, scope);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    params.append('X-Amz-Signature', signature);
    const base = this.config.S3_ENDPOINT.replace(/\/$/, '');
    const prefix = this.config.S3_FORCE_PATH_STYLE
      ? `${base}/${this.config.S3_BUCKET}`
      : base;
    return `${prefix}/${encodeURI(key)}?${params.toString()}`;
  }

  async delete(key: string): Promise<void> {
    if (!this.enabled) throw new Error('storage_disabled');
    const canonicalUri = this.config.S3_FORCE_PATH_STYLE
      ? `/${this.config.S3_BUCKET}/${encodeURI(key)}`
      : `/${encodeURI(key)}`;
    const payloadHash = 'UNSIGNED-PAYLOAD';
    const { authorization, amzDate } = this.sign({
      method: 'DELETE',
      canonicalUri,
      canonicalQuery: '',
      payloadHash,
      now: new Date(),
    });
    const url = this.endpointUrl();
    const res = await fetch(`${url}/${encodeURI(key)}`, {
      method: 'DELETE',
      headers: {
        authorization,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
      },
    });
    if (!res.ok && res.status !== 404) {
      const detail = await res.text();
      throw new Error(`s3_delete_failed:${res.status}:${detail.slice(0, 200)}`);
    }
  }
}