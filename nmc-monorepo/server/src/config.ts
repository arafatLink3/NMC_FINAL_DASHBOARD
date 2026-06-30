/**
 * @nmc/server — runtime config.
 *
 * Resolved from environment variables (with sane local defaults so the
 * server boots out of the box against an in-memory SQLite). Anything
 * mission-critical is validated with zod at boot.
 */
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DB_CLIENT: z.enum(['sqlite', 'pg']).default('sqlite'),
  DB_FILENAME: z.string().default('./data/nmc.sqlite'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('nmc'),
  DB_USER: z.string().default('nmc'),
  DB_PASSWORD: z.string().default('nmc'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(8).default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev-refresh-secret'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  OTEL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  OTEL_SERVICE_NAME: z.string().default('nmc-server'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z
    .string()
    .url()
    .default('http://localhost:14268/api/traces'),

  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),

  // --- SMTP (mail delivery) ---
  // Leave SMTP_HOST empty to disable server-side delivery. The /api/mail/send
  // endpoint will then return 503 with `error: 'smtp_disabled'`.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM_EMAIL: z.string().default('nmc@link3.net'),
  SMTP_FROM_NAME: z.string().default('NMC, Link3 Technologies Ltd.'),

  // --- IMAP (mail fetch / inbox ingest) ---
  // Leave IMAP_HOST empty to disable server-side fetch. The /api/mail/fetch
  // endpoint will then return 503 with `error: 'imap_disabled'`.
  // OUTLOOK_IMAP_HOST is accepted as an alias so operators can copy/paste
  // their Outlook IMAP settings without renaming the variable.
  IMAP_HOST: z.string().default(''),
  OUTLOOK_IMAP_HOST: z.string().default(''),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_SECURE: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  IMAP_USER: z.string().default(''),
  IMAP_PASSWORD: z.string().default(''),
  /** Mailbox path to read from. Outlook default is INBOX. */
  MAIL_FETCH_BOX: z.string().default('INBOX'),
  /** Hard cap on how many messages a single fetch returns. */
  MAIL_FETCH_LIMIT: z.coerce.number().int().positive().max(500).default(50),

  // --- Object storage (MinIO / S3-compatible) ---
  // Leave S3_ENDPOINT empty to disable attachment upload. The /api/attachments
  // endpoint will then return 503 with `error: 'storage_disabled'`.
  S3_ENDPOINT: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('nmc-attachments'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  /** Force path-style addressing (required for MinIO). */
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  /** Optional public URL prefix served back to the browser. */
  S3_PUBLIC_URL: z.string().default(''),

  // --- Azure AD / Domain SSO ---
  AZURE_TENANT_ID: z.string().default(''),
  AZURE_CLIENT_ID: z.string().default(''),
  AZURE_CLIENT_SECRET: z.string().default(''),
  AZURE_REDIRECT_URI: z.string().default('http://localhost:5173/auth/callback'),

  // --- WhatsApp bot (self-hosted, optional) ---
  // When WA_BOT_URL is set, /api/wa/send will POST { to, text } to it.
  WA_BOT_URL: z.string().default(''),
  WA_BOT_TOKEN: z.string().default(''),

  // --- Supabase (managed Postgres) ---
  SUPABASE_DATABASE_URL: z.string().default(''),
});

export type Config = z.infer<typeof Env>;

let _cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (_cached) return _cached;
  // Fall back to OUTLOOK_IMAP_HOST so the same .env file works whether the
  // operator named their variable after Outlook or after the generic IMAP.
  const merged: NodeJS.ProcessEnv = { ...env };
  if (!merged.IMAP_HOST && merged.OUTLOOK_IMAP_HOST) {
    merged.IMAP_HOST = merged.OUTLOOK_IMAP_HOST;
  }
  const parsed = Env.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  _cached = parsed.data;
  return _cached;
}

/** Test-only: clear the memoized config so a fresh env can be loaded. */
export function _resetConfigForTests(): void {
  _cached = null;
}
