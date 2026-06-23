/**
 * Seed the database with default records (only when empty).
 *   tsx server/src/bin/seed.ts
 */
import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { runBrasSeed } from '../seed.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config);
  try {
    const inserted = await runBrasSeed(db);
    console.log(
      inserted === 0
        ? 'Seed skipped (table already populated).'
        : `Inserted ${inserted} BRAS record(s).`
    );
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
