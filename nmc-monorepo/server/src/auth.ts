/**
 * @nmc/server — authentication helpers + Fastify plugin.
 *
 * Two surfaces:
 *   - `hashPassword` / `verifyPassword` for storage (bcryptjs — pure JS).
 *   - `authPlugin` registers @fastify/jwt + a `requireAuth` decorator
 *     and `requireRole('admin')` factory for guarded routes.
 *
 * The plugin is wrapped with `fastify-plugin` so its decorations
 * (`requireAuth`, `requireRole`) leak out of the encapsulation context
 * and become visible to routes registered after `app.register(authPlugin)`.
 *
 * Tokens carry `sub`, `username`, and `role`. Refresh tokens live in a
 * separate namespace (`/auth/refresh`) and are issued by the same plugin.
 */
import bcrypt from 'bcryptjs';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import type { Config } from './config.js';

export type Role = 'admin' | 'operator';

export interface AuthClaims {
  sub: number;
  email: string;
  username: string;
  role: Role;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: Role) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthClaims;
    user: AuthClaims;
  }
}

async function authPluginImpl(
  app: FastifyInstance,
  options: { config: Config }
): Promise<void> {
  await app.register(fastifyJwt, {
    secret: options.config.JWT_ACCESS_SECRET,
    sign: { expiresIn: options.config.JWT_ACCESS_TTL },
  });

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.decorate('requireRole', (role: Role) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.code(401).send({ error: 'unauthorized' });
        return;
      }
      if (req.user.role !== role && req.user.role !== 'admin') {
        reply.code(403).send({ error: 'forbidden' });
      }
    };
  });
}

// fastify-plugin strips the encapsulation so decorations are visible
// on the parent FastifyInstance after `app.register(authPlugin, ...)`.
export const authPlugin = fp(authPluginImpl, {
  name: 'nmc-auth',
  fastify: '4.x',
});
