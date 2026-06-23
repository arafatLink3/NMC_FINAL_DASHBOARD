/**
 * Ported from
 *   migrations/20240602120000_create_bras_records_table.js
 *
 * Identical column set / names so the legacy API wire shape is preserved.
 * The original used raw Knex, so we keep the same style here.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('bras_records', (t) => {
    t.increments('id').primary();

    t.string('region').nullable();
    t.string('zone').nullable();
    t.string('station').nullable();
    t.string('address').nullable();

    // Free-form vendor / kind used by the BRAS sheet (Cisco, Juniper, …)
    t.string('vendor').nullable();
    t.string('kind').nullable();
    t.string('category').nullable();

    t.string('period_start').nullable();
    t.string('period_end').nullable();

    t.string('status').nullable(); // open | in_progress | pending | resolved | closed

    t.string('contact_prefix').nullable();
    t.string('contact_phone').nullable();
    t.string('contact_dashed').nullable();
    t.string('contact_email').nullable();

    t.text('notes').nullable();

    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bras_records');
}
