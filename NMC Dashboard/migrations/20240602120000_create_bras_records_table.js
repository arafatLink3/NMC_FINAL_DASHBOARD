/**
 * Migration: Create `bras_records` table
 *
 * All columns are snake_case to align with the Sequelize model's
 * `underscored: true` setting and the frontend's data-* keys.
 *
 * Run:       npx knex migrate:latest
 * Rollback:  npx knex migrate:rollback
 */
exports.up = async function (knex) {
  await knex.schema.createTable('bras_records', (table) => {
    // Surrogate primary key
    table.increments('id').primary();

    // Domain columns
    table.string('sl', 50).nullable();
    table.string('bras_name', 255).notNullable();
    table.string('loopback', 64).notNullable().unique({ indexName: 'uq_bras_loopback' });
    table.string('zone', 50).nullable();
    table.string('sa_team_leader', 255).nullable();
    table.string('service_agent_name', 255).nullable();
    table.string('service_agent_contact_number', 32).nullable();
    table.string('commission', 100).nullable();
    table.string('nttn', 255).nullable();
    table.string('scr_id', 100).nullable();
    table.string('mis_branch_name', 255).nullable();

    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Fast-lookup indexes on the searchable columns
  await knex.schema.alterTable('bras_records', (table) => {
    table.index(['bras_name'], 'idx_bras_records_bras_name');
    table.index(['service_agent_contact_number'], 'idx_bras_records_sa_contact');
    table.index(['scr_id'], 'idx_bras_records_scr_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('bras_records', (table) => {
    table.dropIndex(['bras_name'], 'idx_bras_records_bras_name');
    table.dropIndex(['service_agent_contact_number'], 'idx_bras_records_sa_contact');
    table.dropIndex(['scr_id'], 'idx_bras_records_scr_id');
  });
  await knex.schema.dropTableIfExists('bras_records');
};
