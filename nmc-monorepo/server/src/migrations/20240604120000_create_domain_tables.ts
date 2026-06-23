/**
 * Creates the domain tables used by the SPA pages that aren't BRAS.
 *
 * Each table carries an integer PK + `data` JSON + `zone` / `status`
 * columns. `data` holds the original seed-json shape verbatim so the
 * frontend doesn't need to change how it renders cards.
 */
import type { Knex } from 'knex';

const TABLES = [
  'tickets',
  'incidents',
  'contacts',
  'nms_links',
  'roster_rows',
  'scr_rows',
  'ccb_rows',
  'mail_messages',
  'settings',
] as const;

async function createTable(knex: Knex, name: string): Promise<void> {
  await knex.schema.createTable(name, (t) => {
    t.increments('id').primary();
    t.string('zone').nullable();
    t.string('status').nullable().index();
    t.json('data').notNullable().defaultTo('{}');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function up(knex: Knex): Promise<void> {
  for (const name of TABLES) {
    await createTable(knex, name);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const name of [...TABLES].reverse()) {
    await knex.schema.dropTableIfExists(name);
  }
}
