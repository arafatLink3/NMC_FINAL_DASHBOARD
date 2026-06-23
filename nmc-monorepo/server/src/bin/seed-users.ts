/**
 * Idempotent seed for the default admin user.
 *   tsx server/src/bin/seed-users.ts [email] [password]
 *
 * Defaults: admin@link3.net / admin123
 *
 * The admin row gets full access to every protected route. Signup is
 * restricted to @link3.net addresses and creates role='operator'
 * rows by default; admins are promoted via the seed script or a
 * future /auth/users endpoint.
 */
import { loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { hashPassword } from '../auth.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config);
  try {
    const email = (process.argv[2] ?? 'admin@link3.net').toLowerCase();
    const password = process.argv[3] ?? 'admin123';
    const hash = await hashPassword(password);
    const existing = await db('users').where({ email }).first();
    if (existing) {
      await db('users').where({ id: existing.id }).update({
        password_hash: hash,
        role: 'admin',
        username: email,
      });
      console.log(`Updated admin user '${email}'.`);
      return;
    }
    await db('users').insert({
      email,
      username: email, // legacy compatibility — username mirrors email
      password_hash: hash,
      display_name: 'Administrator',
      role: 'admin',
    });
    console.log(`Created admin user '${email}'.`);
  } finally {
    await db.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
