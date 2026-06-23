/**
 * Run Knex migrations against the configured DB and exit.
 *
 *   tsx server/src/bin/migrate.ts           # migrate:latest
 *   tsx server/src/bin/migrate.ts rollback  # migrate:rollback
 *   tsx server/src/bin/migrate.ts status    # list applied / pending
 */
import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, '..', 'migrations');

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config);
  try {
    const action = process.argv[2] ?? 'latest';
    if (action === 'rollback') {
      const [batch, reverted] = await db.migrate.rollback({
        directory: migrationsDir,
      });
      console.log(`Batch ${batch} reverted ${reverted.length} migration(s).`);
    } else if (action === 'status') {
      const list = await db.migrate.list({ directory: migrationsDir });
      console.log(list);
    } else {
      const [batch, applied] = await db.migrate.latest({
        directory: migrationsDir,
      });
      console.log(`Batch ${batch} applied ${applied.length} migration(s).`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
