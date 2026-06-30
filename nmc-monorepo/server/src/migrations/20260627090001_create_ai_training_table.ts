/**
 * Creates the `ai_training` table that persists manual operator
 * overrides for the AI classifier.
 *
 * Previously this lived in `localStorage` under `nmc.aiTraining` and
 * only worked for the local browser. Persisting it server-side means
 * the same overrides follow every operator across devices, and the
 * dashboard can show what the model has learned.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_training', (t) => {
    t.increments('id').primary();
    t.string('category').notNullable();
    t.string('department').notNullable();
    t.string('sub_category').nullable();
    t.timestamp('trained_at').defaultTo(knex.fn.now());
    t.unique(['category', 'department', 'sub_category']);
  });
  await knex.schema.alterTable('ai_training', (t) => {
    t.index(['category']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_training');
}