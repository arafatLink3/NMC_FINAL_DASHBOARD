/**
 * @nmc/server — Fastify app factory.
 *
 * The factory accepts a Knex instance and config so the same code can
 * serve both the live process (src/server.ts) and tests (in-memory
 * sqlite, injected deps).
 */
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifySensible from '@fastify/sensible';
import { z } from 'zod';
import type { Knex } from 'knex';

import type { Config } from './config.js';
import { authPlugin, hashPassword, verifyPassword } from './auth.js';
import { BrasRepository } from './modules/bras/repository.js';
import { registerBrasController } from './modules/bras/controller.js';
import { registerAiRoutes } from './modules/ai/routes.js';
import { AiTrainingRepository } from './modules/ai/training.js';
import { registerDomainRoutes } from './modules/domain-routes.js';
import { Mailer } from './modules/mail/mailer.js';
import { MailFetcher, type FetchedMail } from './modules/mail/imap.js';
import { MailRepository } from './modules/mail/repository.js';
import { ObjectStorage } from './modules/storage/s3.js';
import { runWeeklyReport, runMonthlyReport } from './scheduler.js';
import { createAzureAuthClient, type AzureProfile } from './modules/auth/azure.js';
import { PkceStore } from './modules/auth/pkce-store.js';
import { __internal } from './modules/auth/azure.js';

export interface AppDeps {
  config: Config;
  db: Knex;
  /** Optional pre-built Mailer (tests pass a stub). */
  mailer?: Mailer;
  /** Optional pre-built MailFetcher (tests pass a stub). */
  mailFetcher?: MailFetcher;
  /** Optional override for the mail repository (tests pass a stub). */
  mailRepo?: MailRepository;
  /** Optional pre-built object storage client (tests pass a stub). */
  storage?: ObjectStorage;
}

// The api-client and the legacy SPA call `/api/auth/*`, but the
// in-tree tests (and our curl checks) hit `/auth/*`. Register both
// prefixes from a single handler so the two surfaces stay in sync.
function aliasAuth(
  app: FastifyInstance,
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  opts: Omit<RouteOptions, 'method' | 'url' | 'handler'>,
  handler: RouteOptions['handler'],
): void {
  const register = (prefix: string) =>
    app.route({ ...opts, method, url: `${prefix}${path}`, handler });
  register('/auth');
  register('/api/auth');
}

const LoginBody = z.object({
  // The new SPA sends the user's email; legacy clients may still
  // send a username. We look up by either column server-side.
  username: z.string().min(1),
  password: z.string().min(1),
});

// Signup is open to anyone with a @link3.net address. The new row
// gets role 'operator' — admins are created by the seed script or by
// an existing admin via the /auth/users endpoint.
const SignupBody = z.object({
  email: z.string().email().refine((v) => v.toLowerCase().endsWith('@link3.net'), {
    message: 'email_must_be_link3',
  }),
  password: z.string().min(8, 'password_too_short'),
  displayName: z.string().min(1).max(120).optional(),
});

export async function buildFastify(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
    bodyLimit: config.UPLOAD_MAX_BYTES,
  });

  await app.register(fastifyCookie);
  await app.register(fastifyCors, {
    origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.UPLOAD_MAX_BYTES, files: 1 },
  });
  await app.register(fastifySensible);
  await app.register(authPlugin, { config });

  // Dev-only convenience: if the `users` table is empty (fresh clone,
  // wiped data dir, first run), seed the default admin so a fresh
  // `pnpm dev` always has a usable login. Production and tests skip
  // this because they either manage users externally or inject them
  // via the test harness.
  if (config.NODE_ENV === 'development') {
    try {
      const existing = await db('users').first();
      if (!existing) {
        const adminEmail = 'admin@link3.net';
        const adminPass = 'admin123';
        const password_hash = await hashPassword(adminPass);
        await db('users').insert({
          email: adminEmail,
          username: adminEmail,
          password_hash,
          display_name: 'Administrator',
          role: 'admin',
        });
        app.log.warn(
          { email: adminEmail },
          'seeded default admin (empty users table). Override with seed-users.ts.',
        );
      }
    } catch (err) {
      app.log.warn({ err }, 'admin auto-seed skipped (table missing?)');
    }
  }

  app.get('/health', async () => ({
    status: 'ok',
    service: config.OTEL_SERVICE_NAME,
    time: new Date().toISOString(),
  }));

  // Mirror `/health` under `/api/health` for the api-client surface.
  app.get('/api/health', async () => ({
    status: 'ok',
    service: config.OTEL_SERVICE_NAME,
    time: new Date().toISOString(),
  }));

  // SMTP transport — built once per process. /api/mail/send uses this
  // when the operator hits the new "Send" button on the dashboard.
  const mailer = deps.mailer ?? new Mailer(config);
  app.decorate('mailer', mailer);

  // IMAP transport — built once per process. /api/mail/fetch uses this
  // when the dashboard polls the Outlook inbox for new mail.
  const mailFetcher = deps.mailFetcher ?? new MailFetcher(config);
  app.decorate('mailFetcher', mailFetcher);

  // Mail cache — backs /api/mail/list so the inbox survives restarts.
  const mailRepo = deps.mailRepo ?? new MailRepository(db);
  mailFetcher.attachRepository(mailRepo);
  app.decorate('mailRepo', mailRepo);

  // Object storage (MinIO / S3-compatible). Disabled when S3_ENDPOINT
  // is empty so the server still boots in dev without a storage host.
  const storage = deps.storage ?? new ObjectStorage(config);
  app.decorate('storage', storage);

  const loginHandler = async (req: any, reply: any) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    const identifier = parsed.data.username.toLowerCase();
    const user = await db('users')
      .where({ email: identifier })
      .orWhere({ username: identifier })
      .first();
    if (!user) return reply.code(401).send({ error: 'invalid_credentials' });
    const ok = await verifyPassword(parsed.data.password, user.password_hash);
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' });
    const token = app.jwt.sign({
      sub: user.id,
      email: user.email ?? '',
      username: user.username,
      role: user.role,
    });
    return reply.send({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  };

  aliasAuth(app, 'post', '/login', {}, loginHandler);

  // POST /auth/signup — public. Creates a new operator account whose
  // email must end with @link3.net. Returns the JWT so the SPA can
  // drop the user into the dashboard without a follow-up login.
  const signupHandler = async (req: any, reply: any) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? 'bad_input';
      return reply.code(400).send({ error: issue });
    }
    const email = parsed.data.email.toLowerCase();
    const existing = await db('users').where({ email }).first();
    if (existing) return reply.code(409).send({ error: 'email_taken' });
    const password_hash = await hashPassword(parsed.data.password);
    const username = email; // username mirrors email for legacy compatibility
    const [id] = await db('users').insert({
      email,
      username,
      password_hash,
      display_name: parsed.data.displayName ?? null,
      role: 'operator',
    });
    const userId = id ?? 0;
    const token = app.jwt.sign({ sub: userId, email, username, role: 'operator' });
    return reply.send({
      token,
      user: { id: userId, email, username, role: 'operator' },
    });
  };

  aliasAuth(app, 'post', '/signup', {}, signupHandler);

  const meHandler = async (req: any) => ({ user: req.user });
  aliasAuth(app, 'get', '/me', { preHandler: [app.requireAuth] }, meHandler);

  // Azure AD / Entra ID SSO ───────────────────────────────────────────
  //   GET  /api/auth/azure/start?return_to=…
  //     → 200 { url, state } (the SPA does window.location = url)
  //   GET  /api/auth/azure/callback?code=&state=
  //     → 302 to SPA with ?token=…&user=… (or ?error=…)
  //   GET  /api/auth/me — already declared above as `/me`
  //
  // First Azure login auto-provisions the operator with role
  // 'operator'. Subsequent logins match by `oid` (stable per tenant)
  // and re-issue a JWT.
  const azureClient = createAzureAuthClient(config);
  const pkceStore = new PkceStore(db);
  app.decorate('azureClient', azureClient);

  // GET /api/auth/azure/status — non-secret config probe so the SPA
  // can hide the "Sign in with Microsoft" button when SSO is unset.
  app.get('/api/auth/azure/status', async () => ({
    enabled: azureClient.enabled,
    redirectUri: config.AZURE_REDIRECT_URI,
  }));

  // GET /api/auth/azure/start — mints PKCE state and returns the
  // authorize URL. The browser navigates to that URL.
  const AzureStartQuery = z.object({
    return_to: z.string().optional(),
  });
  app.get('/api/auth/azure/start', async (req: any, reply: any) => {
    if (!azureClient.enabled) {
      return reply.code(503).send({ error: 'azure_ad_disabled' });
    }
    const parsed = AzureStartQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
    const state = __internal.randomState();
    const nonce = __internal.randomState();
    const verifier = __internal.randomVerifier();
    await pkceStore.put({
      state,
      nonce,
      code_verifier: verifier,
      return_to: parsed.data.return_to ?? null,
    });
    // Store the verifier-derived challenge server-side too: the
    // browser only ever sees `state` and `nonce`.
    await pkceStore.put({
      state: `${state}::v`,
      nonce: __internal.challengeFor(verifier),
      code_verifier: '',
      return_to: null,
    });
    const url = azureClient.buildAuthorizeUrl(state, nonce);
    return reply.send({ url, state });
  });

  // GET /api/auth/azure/callback — Azure redirects the browser here
  // with `code` + `state`. We exchange the code, upsert the user,
  // issue a JWT, and 302 back to the SPA with the token in the
  // fragment (so it isn't logged by intermediate proxies).
  app.get('/api/auth/azure/callback', async (req: any, reply: any) => {
    if (!azureClient.enabled) {
      return reply.code(503).send({ error: 'azure_ad_disabled' });
    }
    const q = z
      .object({
        code: z.string().min(1),
        state: z.string().min(1),
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: 'bad_input' });
    if (q.data.error) {
      return reply
        .code(400)
        .redirect(`${config.CORS_ORIGIN.split(',')[0]}/auth/error?error=${encodeURIComponent(q.data.error)}`);
    }
    const entry = await pkceStore.take(q.data.state);
    if (!entry) {
      return reply
        .code(400)
        .redirect(`${config.CORS_ORIGIN.split(',')[0]}/auth/error?error=invalid_state`);
    }
    const verRow = await pkceStore.take(`${q.data.state}::v`).catch(() => null);
    const challenge = verRow?.nonce;
    if (!challenge) {
      return reply
        .code(400)
        .redirect(`${config.CORS_ORIGIN.split(',')[0]}/auth/error?error=missing_verifier`);
    }
    let profile: AzureProfile;
    try {
      profile = await azureClient.exchangeCode(q.data.code, challenge, entry.nonce);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err }, 'azure code exchange failed');
      return reply
        .code(502)
        .redirect(`${config.CORS_ORIGIN.split(',')[0]}/auth/error?error=${encodeURIComponent(message)}`);
    }
    const email = profile.preferred_username.toLowerCase();
    if (!email) {
      return reply
        .code(400)
        .redirect(`${config.CORS_ORIGIN.split(',')[0]}/auth/error?error=missing_email`);
    }
    // Auto-provision by Azure `oid` first, then fall back to email so
    // tenants without `oid` still work.
    let user = await db('users').where({ azure_oid: profile.oid }).first();
    if (!user) user = await db('users').where({ email }).first();
    if (!user) {
      const [id] = await db('users').insert({
        email,
        username: email,
        password_hash: null,
        display_name: profile.name || null,
        role: 'operator',
        azure_oid: profile.oid,
        azure_tid: profile.tid,
        auth_provider: 'azure',
      });
      user = { id: id ?? 0, email, username: email, role: 'operator' };
    } else if (!user.azure_oid) {
      await db('users')
        .where({ id: user.id })
        .update({ azure_oid: profile.oid, azure_tid: profile.tid, auth_provider: 'azure' });
    }
    const token = app.jwt.sign({
      sub: user.id,
      email,
      username: user.username,
      role: user.role,
    });
    const userJson = encodeURIComponent(
      JSON.stringify({ id: user.id, email, username: user.username, role: user.role }),
    );
    const ret = entry.return_to ?? '/';
    const base = config.CORS_ORIGIN.split(',')[0] ?? '';
    return reply.redirect(`${base}${ret}#token=${token}&user=${userJson}&provider=azure`);
  });

  // GET /api/auth/azure/callback.json — same flow as above but returns
  // JSON instead of a 302 redirect. Used by the React Native mobile
  // client, which completes the OAuth code exchange via fetch + an
  // in-app deep link rather than a browser redirect.
  app.get('/api/auth/azure/callback.json', async (req: any, reply: any) => {
    if (!azureClient.enabled) {
      return reply.code(503).send({ error: 'azure_ad_disabled' });
    }
    const q = z
      .object({
        code: z.string().min(1),
        state: z.string().min(1),
      })
      .safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: 'bad_input' });
    const entry = await pkceStore.take(q.data.state);
    if (!entry) return reply.code(400).send({ error: 'invalid_state' });
    const verRow = await pkceStore.take(`${q.data.state}::v`).catch(() => null);
    const challenge = verRow?.nonce;
    if (!challenge) return reply.code(400).send({ error: 'missing_verifier' });
    let profile: AzureProfile;
    try {
      profile = await azureClient.exchangeCode(q.data.code, challenge, entry.nonce);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err }, 'azure code exchange failed (mobile)');
      return reply.code(502).send({ error: 'azure_exchange_failed', detail: message });
    }
    const email = profile.preferred_username.toLowerCase();
    if (!email) return reply.code(400).send({ error: 'missing_email' });
    let user = await db('users').where({ azure_oid: profile.oid }).first();
    if (!user) user = await db('users').where({ email }).first();
    if (!user) {
      const [id] = await db('users').insert({
        email,
        username: email,
        password_hash: null,
        display_name: profile.name || null,
        role: 'operator',
        azure_oid: profile.oid,
        azure_tid: profile.tid,
        auth_provider: 'azure',
      });
      user = { id: id ?? 0, email, username: email, role: 'operator' };
    } else if (!user.azure_oid) {
      await db('users')
        .where({ id: user.id })
        .update({ azure_oid: profile.oid, azure_tid: profile.tid, auth_provider: 'azure' });
    }
    const token = app.jwt.sign({
      sub: user.id,
      email,
      username: user.username,
      role: user.role,
    });
    return reply.send({
      token,
      user: { id: user.id, email, username: user.username, role: user.role },
      profile: { id: profile.oid, email, name: profile.name },
    });
  });

  // IMAP fetch ────────────────────────────────────────────────────────
  // GET /api/mail/fetch?since=ISO — returns a normalized list of
  // messages received by the configured Outlook mailbox. Requires
  // auth so anonymous callers cannot read the inbox.
  const FetchQuery = z.object({
    since: z.string().datetime().optional(),
    mailbox: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  });
  app.get(
    '/api/mail/fetch',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      if (!mailFetcher.enabled) {
        return reply.code(503).send({ error: 'imap_disabled' });
      }
      const parsed = FetchQuery.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'bad_input' });
      }
      try {
        const rows: FetchedMail[] = await mailFetcher.fetchSince(parsed.data);
        return reply.send({ rows, total: rows.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'imap fetch failed');
        return reply.code(502).send({ error: 'imap_upstream_failed', detail: message });
      }
    },
  );

  // POST /api/mail/read — flip the \Seen flag on a message so the next
  // poll (or another client) sees it as read. Returns the refreshed row.
  const MarkReadBody = z.object({
    uid: z.coerce.number().int().positive(),
    mailbox: z.string().min(1).optional(),
  });
  app.post(
    '/api/mail/read',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      if (!mailFetcher.enabled) {
        return reply.code(503).send({ error: 'imap_disabled' });
      }
      const parsed = MarkReadBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'bad_input' });
      }
      try {
        const row = await mailFetcher.markRead(parsed.data.uid, parsed.data.mailbox);
        if (!row) return reply.code(404).send({ error: 'not_found' });
        return reply.send(row);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'imap markRead failed');
        return reply.code(502).send({ error: 'imap_upstream_failed', detail: message });
      }
    },
  );

  // DELETE /api/mail/:uid — flag a message as \Deleted and expunge it
  // from the configured mailbox. Query string ?mailbox= overrides the
  // default. Returns 204 on success, 404 when the UID is gone.
  const DeleteParams = z.object({
    uid: z.coerce.number().int().positive(),
  });
  const DeleteQuery = z.object({
    mailbox: z.string().min(1).optional(),
  });
  app.delete(
    '/api/mail/:uid',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      if (!mailFetcher.enabled) {
        return reply.code(503).send({ error: 'imap_disabled' });
      }
      const params = DeleteParams.safeParse(req.params ?? {});
      const query = DeleteQuery.safeParse(req.query ?? {});
      if (!params.success || !query.success) {
        return reply.code(400).send({ error: 'bad_input' });
      }
      try {
        const ok = await mailFetcher.deleteMessage(params.data.uid, query.data.mailbox);
        if (!ok) return reply.code(404).send({ error: 'not_found' });
        return reply.code(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'imap delete failed');
        return reply.code(502).send({ error: 'imap_upstream_failed', detail: message });
      }
    },
  );

  // GET /api/mail/list — read cached mail from the local DB. The
  // inbox page prefers this over /api/mail/fetch because it is fast
  // (no IMAP round-trip) and survives server restarts. Use
  // /api/mail/fetch to trigger a fresh ingest.
  const ListQuery = z.object({
    since: z.string().datetime().optional(),
    mailbox: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  });
  app.get(
    '/api/mail/list',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      const parsed = ListQuery.safeParse(req.query ?? {});
      if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
      const rows = await mailRepo.list(parsed.data);
      return reply.send({ rows, total: rows.length });
    },
  );

  // GET /api/mail/count — number of non-deleted rows in the cache.
  // Used by the dashboard KPI tile so the inbox badge stays accurate
  // even when IMAP is disabled.
  app.get(
    '/api/mail/count',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      const mailbox = typeof req.query?.mailbox === 'string' ? req.query.mailbox : 'INBOX';
      const total = await mailRepo.count(mailbox);
      return reply.send({ mailbox, total });
    },
  );

  // GET /api/mail/status — returns whether the inbound (IMAP) and outbound
  // (SMTP) transports are configured on the server. Surfaces in the Settings
  // page so the operator can see why their poller is or isn't running.
  app.get(
    '/api/mail/status',
    { preHandler: [app.requireAuth] },
    async (_req: any, reply: any) => {
      const imap = mailFetcher.enabled;
      const smtp = mailer.enabled;
      if (!imap && !smtp) {
        return reply.code(503).send({ imap, smtp, error: 'mail_disabled' });
      }
      return reply.send({ imap, smtp });
    },
  );

  // GET /api/mail/:uid/attachments — returns the attachment metadata
  // (and presigned URLs) for a single fetched mail row.
  const AttachParams = z.object({ uid: z.coerce.number().int().positive() });
  const AttachQuery = z.object({ mailbox: z.string().min(1).optional() });
  app.get(
    '/api/mail/:uid/attachments',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      const params = AttachParams.safeParse(req.params ?? {});
      const query = AttachQuery.safeParse(req.query ?? {});
      if (!params.success || !query.success) {
        return reply.code(400).send({ error: 'bad_input' });
      }
      const mailbox = query.data.mailbox ?? config.MAIL_FETCH_BOX;
      const raw = (await mailRepo.attachments(params.data.uid, mailbox)) as Array<{
        filename: string; contentType: string; size: number; s3Key: string;
      }>;
      const enriched = storage.enabled
        ? raw.map((a) => ({ ...a, url: storage.presignedGetUrl(a.s3Key) }))
        : raw;
      return reply.send({ uid: params.data.uid, mailbox, attachments: enriched });
    },
  );

  // POST /api/attachments — multipart upload to S3/MinIO. Returns
  // the persisted key + public URL so the caller can attach the
  // reference to a mail send or to a fetched mail row.
  app.post(
    '/api/attachments',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      if (!storage.enabled) {
        return reply.code(503).send({ error: 'storage_disabled' });
      }
      const file = await (req as { file?: () => Promise<unknown> }).file?.();
      // fastify-multipart exposes the file via req.file(); fall back
      // to the raw stream if the decorator is missing.
      const part = file as
        | { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }
        | undefined;
      if (!part) return reply.code(400).send({ error: 'no_file' });
      const buf = await part.toBuffer();
      const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${new Date().toISOString().slice(0, 10)}/${Date.now()}_${safeName}`;
      try {
        const put = await storage.put(key, buf, part.mimetype || 'application/octet-stream');
        return reply.send(put);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 's3 put failed');
        return reply.code(502).send({ error: 'storage_upstream_failed', detail: message });
      }
    },
  );

  // POST /api/wa/send — push a message through the self-hosted wa-bot
  // (wa-automate / open-wa / wppconnect / etc.). Disabled when the
  // bot URL is empty so the dashboard's WhatsApp button keeps falling
  // back to wa.me links when no bot is configured.
  const WaSendBody = z.object({
    to: z.string().min(1),
    text: z.string().min(1),
  });
  app.post(
    '/api/wa/send',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      if (!config.WA_BOT_URL) {
        return reply.code(503).send({ error: 'wa_bot_disabled' });
      }
      const parsed = WaSendBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
      try {
        const res = await fetch(config.WA_BOT_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.WA_BOT_TOKEN ? { authorization: `Bearer ${config.WA_BOT_TOKEN}` } : {}),
          },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) {
          const detail = await res.text();
          return reply.code(502).send({ error: 'wa_bot_upstream_failed', detail: detail.slice(0, 200) });
        }
        const body = await res.json().catch(() => ({}));
        return reply.send({ ok: true, botResponse: body });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, 'wa-bot send failed');
        return reply.code(502).send({ error: 'wa_bot_unreachable', detail: message });
      }
    },
  );

  // POST /api/attachments
  // summary. Useful for the Reports page "Run now" button and as a
  // fallback when the scheduler has been disabled.
  const RunReportBody = z.object({
    kind: z.enum(['weekly', 'monthly']),
  });
  app.post(
    '/api/reports/run',
    { preHandler: [app.requireAuth] },
    async (req: any, reply: any) => {
      const parsed = RunReportBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'bad_input' });
      const deps = { config, db, mailFetcher, mailer };
      const now = new Date();
      if (parsed.data.kind === 'weekly') {
        await runWeeklyReport(deps, now);
      } else {
        await runMonthlyReport(deps, now);
      }
      return reply.send({ ok: true, kind: parsed.data.kind, ranAt: now.toISOString() });
    },
  );

  // BRAS
  const brasRepo = new BrasRepository(db);
  registerBrasController(app, brasRepo);

  // AI proxy — backed by the persistent training repo so learned
// overrides survive restarts and follow the operator across devices.
  const aiTraining = new AiTrainingRepository(db);
  registerAiRoutes(app, aiTraining);

  // Domain CRUD
  registerDomainRoutes(app, db);

  return app;
}

/** Module augmentation so `app.mailer` / `app.mailFetcher` are type-safe. */
declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
    mailFetcher: MailFetcher;
    mailRepo: MailRepository;
    storage: ObjectStorage;
    azureClient: ReturnType<typeof createAzureAuthClient>;
  }
}
