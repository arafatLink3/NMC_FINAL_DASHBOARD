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
import { registerDomainRoutes } from './modules/domain-routes.js';
import { Mailer } from './modules/mail/mailer.js';

export interface AppDeps {
  config: Config;
  db: Knex;
  /** Optional pre-built Mailer (tests pass a stub). */
  mailer?: Mailer;
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

  // BRAS
  const brasRepo = new BrasRepository(db);
  registerBrasController(app, brasRepo);

  // AI proxy
  registerAiRoutes(app);

  // Domain CRUD
  registerDomainRoutes(app, db);

  return app;
}

/** Module augmentation so `app.mailer` is type-safe across the codebase. */
declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
  }
}
