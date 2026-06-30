/**
 * Migration: auth PKCE / state store for Azure AD OIDC.
 *
 * One row per `/api/auth/azure/start` call. The browser is redirected
 * to Azure with `state`; on callback we look up the matching row,
 * verify `state` + `nonce`, exchange the auth code using the stored
 * `code_verifier`, and delete the row.
 *
 * Rows auto-expire after 10 minutes (matches the Azure AD max age).
 */
import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('auth_pkce', (t) => {
    t.string('state').primary();
    t.string('code_verifier').notNullable();
    t.string('nonce').notNullable();
    t.string('return_to').nullable();
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now());
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('auth_pkce');
}
