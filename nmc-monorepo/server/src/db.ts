/**
 * @nmc/server — Knex connection factory.
 *
 * sqlite3 by default for local dev and tests (no service required).
 * Pass DB_CLIENT=pg for production. Knex's TypeScript types do not
 * ship first-class sqlite3 typings, so we cast to `any` on the
 * underlying driver config to keep the public surface clean.
 */
import knexFactory, { type Knex } from 'knex';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Config } from './config.js';

export type DbClient = 'sqlite' | 'pg';

const here = dirname(fileURLToPath(import.meta.url));
/** Directory of compiled .js migrations (sibling of this file's dist/ root). */
const migrationsDir = resolve(here, 'migrations');

export function createDb(config: Config): Knex {
  if (config.DB_CLIENT === 'sqlite') {
    return knexFactory({
      client: 'sqlite3',
      connection: { filename: config.DB_FILENAME },
      useNullAsDefault: true,
      // Only consider compiled .js migrations — .d.ts siblings
      // emitted by tsc are not valid migration modules.
      migrations: { directory: migrationsDir, loadExtensions: ['.js'] },
      pool: {
        // sqlite serialises writes anyway; keep the pool small but
        // big enough to let Fastify handlers run in parallel reads.
        min: 1,
        max: 4,
        afterCreate: (conn: unknown, done: (err: unknown, conn: unknown) => void) => {
          // sqlite needs explicit foreign keys per connection.
          if (conn && typeof conn === 'object' && 'exec' in conn) {
            (conn as { exec: (sql: string) => void }).exec('PRAGMA foreign_keys = ON;');
          }
          done(null, conn);
        },
      },
    });
  }

  return knexFactory({
    client: 'pg',
    connection: {
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.DB_NAME,
      user: config.DB_USER,
      password: config.DB_PASSWORD,
    },
    migrations: { directory: migrationsDir, loadExtensions: ['.js'] },
    pool: { min: 2, max: 10 },
  });
}
