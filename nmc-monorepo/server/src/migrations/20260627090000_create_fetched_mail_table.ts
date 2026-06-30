/**
 * Creates the `fetched_mail` table that backs the dashboard inbox.
 *
 * Unlike `mail_messages` (which is a generic JSON blob fed by the
 * legacy SPA), this table is column-rich so:
 *   - dedupe against Outlook is cheap (uid + mailbox is unique),
 *   - filtering / sorting in the inbox page is index-driven,
 *   - markRead / deleteMessage can mutate a single row instead of
 *     re-querying IMAP on every poll.
 *
 * `attachments` is a JSON column. Each entry mirrors the shape
 * produced by mailparser: { filename, contentType, size, s3Key }.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('fetched_mail', (t) => {
    t.increments('id').primary();
    t.integer('uid').notNullable();
    t.string('mailbox').notNullable().defaultTo('INBOX');
    t.string('message_id').nullable().index();
    t.string('subject').nullable();
    t.text('from_json').nullable();
    t.text('to_json').nullable();
    t.text('cc_json').nullable();
    t.text('text_body').nullable();
    t.text('html_body').nullable();
    t.timestamp('internal_date').nullable().index();
    t.boolean('seen').notNullable().defaultTo(false).index();
    t.boolean('deleted').notNullable().defaultTo(false).index();
    t.json('attachments').nullable();
    t.timestamp('fetched_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['uid', 'mailbox']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('fetched_mail');
}