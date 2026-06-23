/**
 * Adds an `email` column to the users table.
 *
 * The auth layer now identifies users by email rather than username
 * so we can run a self-service signup flow that only allows @link3.net
 * addresses. The legacy `username` column is preserved (still unique,
 * still indexed) so older code paths keep working.
 *
 *   - admin@link3.net  → full access (seeded by `seed-users.ts`)
 *   - <anything>@link3.net → signup is allowed, role = 'operator'
 *   - other domains    → signup rejected with 400
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add nullable + unique so existing rows that pre-date this migration
  // (which have only a username) keep working.
  await knex.schema.alterTable('users', (t) => {
    t.string('email').nullable().unique();
  });

  // Backfill `email` for any existing rows so the unique index can be
  // satisfied. We synthesise <username>@link3.local — these rows are
  // the legacy admin/operator accounts created before the email column
  // existed; the seeder re-runs as part of the deployment and overwrites
  // them with the canonical admin@link3.net entry below.
  const users = await knex('users').select('id', 'username').whereNull('email');
  for (const u of users) {
    await knex('users').where({ id: u.id }).update({ email: `${u.username}@link3.local` });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropUnique(['email']);
    t.dropColumn('email');
  });
}
