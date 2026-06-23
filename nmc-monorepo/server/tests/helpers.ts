/**
 * Test harness: build a fresh Fastify instance + sqlite in-memory DB,
 * run the migrations, and return everything. Each test file imports
 * this so we don't depend on the live `data/nmc.sqlite` file.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { buildFastify } from '../src/app.js';
import { createDb } from '../src/db.js';
import { loadConfig, _resetConfigForTests } from '../src/config.js';
import { hashPassword } from '../src/auth.js';

export interface TestHarness {
  app: FastifyInstance;
  db: Knex;
  config: ReturnType<typeof loadConfig>;
  seedAdmin: (username?: string, password?: string) => Promise<number>;
  login: (username: string, password: string) => Promise<string>;
}

export async function makeHarness(): Promise<TestHarness> {
  _resetConfigForTests();
  const dir = mkdtempSync(join(tmpdir(), 'nmc-srv-'));
  process.env.DB_CLIENT = 'sqlite';
  process.env.DB_FILENAME = join(dir, 'test.sqlite');
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.LOG_LEVEL = 'silent';
  process.env.OTEL_ENABLED = 'false';

  const config = loadConfig();
  const db = createDb(config);

  // Run the migrations from src/migrations
  await db.migrate.latest({ directory: join(process.cwd(), 'src', 'migrations') });

  const app = await buildFastify({ config, db });

  const seedAdmin = async (
    username = 'admin',
    password = 'admin123'
  ): Promise<number> => {
    const hash = await hashPassword(password);
    const [id] = await db('users').insert({
      username,
      password_hash: hash,
      role: 'admin',
    });
    return Number(id);
  };

  const login = async (username: string, password: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username, password },
    });
    const body = res.json() as { token: string };
    return body.token;
  };

  return { app, db, config, seedAdmin, login };
}

export async function teardown(h: TestHarness): Promise<void> {
  await h.app.close();
  await h.db.destroy();
}
