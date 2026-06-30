/**
 * Migration: Azure AD / Entra ID columns on `users`.
 *
 *   - `password_hash` becomes nullable so Azure-only accounts have no
 *     local credential. Local-only accounts still keep theirs.
 *   - `azure_oid` is the stable `oid` claim from the id_token; unique
 *     so each Azure principal maps to exactly one local user.
 *   - `azure_tid` is the tenant id; useful for multi-tenant dashboards.
 *   - `auth_provider` is 'local' | 'azure' so the UI can show the
 *     right "Sign in with Microsoft" vs "Change password" affordances.
 *
 * Existing rows default to `auth_provider = 'local'`.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.string('azure_oid').nullable().unique();
    t.string('azure_tid').nullable();
    t.string('auth_provider').notNullable().defaultTo('local');
  });
  // password_hash must become nullable for Azure-only signups.
  // SQLite ALTER COLUMN only works on 3.35+, so for older builds we
  // copy the table in a transaction. Skip when it's already nullable.
  const isNotNullRows = await knex.raw<{ rows?: unknown[] }>(
    knex.client.dialect === 'sqlite' || knex.client.dialect === 'sqlite3'
      ? "SELECT 1 AS hit FROM pragma_table_info('users') WHERE name='password_hash' AND \"notnull\"=1 LIMIT 1"
      : "SELECT 1 AS hit FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash' AND is_nullable='NO' LIMIT 1",
  );
  const rows = (isNotNullRows as { rows?: unknown[] }).rows ?? [];
  if (rows.length > 0) {
    if (knex.client.dialect === 'sqlite' || knex.client.dialect === 'sqlite3') {
      // SQLite can't drop NOT NULL in place — rebuild the table.
      await knex.raw('PRAGMA foreign_keys=OFF');
      await knex.transaction(async (trx) => {
        await trx.raw(
          'CREATE TABLE users__new (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT, display_name TEXT, role TEXT NOT NULL DEFAULT \'operator\', email TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, azure_oid TEXT UNIQUE, azure_tid TEXT, auth_provider TEXT NOT NULL DEFAULT \'local\')',
        );
        await trx.raw(
          'INSERT INTO users__new (id, username, password_hash, display_name, role, email, created_at, updated_at, azure_oid, azure_tid, auth_provider) SELECT id, username, password_hash, display_name, role, email, created_at, updated_at, azure_oid, azure_tid, auth_provider FROM users',
        );
        await trx.raw('DROP TABLE users');
        await trx.raw('ALTER TABLE users__new RENAME TO users');
      });
      await knex.raw('PRAGMA foreign_keys=ON');
    } else {
      await knex.raw('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropUnique(['azure_oid']);
    t.dropColumn('azure_oid');
    t.dropColumn('azure_tid');
    t.dropColumn('auth_provider');
  });
}