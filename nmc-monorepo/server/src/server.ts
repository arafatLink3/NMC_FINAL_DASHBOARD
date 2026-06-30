/**
 * @nmc/server — process entrypoint.
 *
 *   tsx server/src/server.ts
 *
 * Boots config, telemetry, Knex, then the Fastify app. Handles
 * SIGINT / SIGTERM with a graceful shutdown that closes the HTTP
 * server before tearing down the DB pool and the OTel exporter.
 */
import { loadConfig } from './config.js';
import { startTelemetry } from './telemetry.js';
import { createDb } from './db.js';
import { buildFastify } from './app.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const stopTelemetry = startTelemetry(config);
  const db = createDb(config);
  const app = await buildFastify({ config, db });
  const scheduler = startScheduler({
    config,
    db,
    mailFetcher: app.mailFetcher,
    mailer: app.mailer,
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try { scheduler.stop(); } catch { /* ignore */ }
    try {
      await app.close();
    } catch (err) {
      app.log.error({ err }, 'app.close failed');
    }
    try {
      await db.destroy();
    } catch (err) {
      // already destroyed
    }
    await stopTelemetry();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
