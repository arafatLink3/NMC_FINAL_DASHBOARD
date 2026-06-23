/**
 * @nmc/server — public package surface.
 *
 * Consumers (apps/web, scripts, infra tooling) should import from
 * `@nmc/server` only. Internal modules may be reached via the
 * documented subpath exports `@nmc/server/db` and
 * `@nmc/server/config`.
 */
export { loadConfig, type Config } from './config.js';
export { createDb, type DbClient } from './db.js';
export {
  hashPassword,
  verifyPassword,
  authPlugin,
  type AuthClaims,
  type Role,
} from './auth.js';
export { buildFastify, type AppDeps } from './app.js';
export {
  BrasRepository,
  normaliseContact,
  BRAS_COLUMNS,
  type BrasRecordDTO,
  type BrasSearchParams,
} from './modules/bras/repository.js';
