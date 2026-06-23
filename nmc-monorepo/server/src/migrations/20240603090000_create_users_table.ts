/**
 * Minimal users table for the auth layer.
 *
 * One row = one operator. Roles drive route guards elsewhere.
 *   - 'admin'  : full access (BRAS write, AI proxy, settings)
 *   - 'operator' : read + restricted write
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('username').notNullable().unique();
    t.string('password_hash').notNullable();
    t.string('display_name').nullable();
    t.string('role').notNullable().defaultTo('operator');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
