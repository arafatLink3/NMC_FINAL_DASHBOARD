/**
 * @nmc/server — OpenTelemetry bootstrap.
 *
 * Starts an OTel Node SDK with an OTLP/HTTP trace exporter, scoped to the
 * Fastify server, knex, and node runtime. No-ops when OTEL_ENABLED is
 * false (default in dev/test) so boot stays fast and dependency-free.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { Config } from './config.js';

let started = false;

/**
 * Start the OTel SDK if tracing is enabled. Returns a shutdown function.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startTelemetry(
  config: Config,
  options?: { enabled?: boolean }
): () => Promise<void> {
  if (started) return async () => {};
  const enabled = options?.enabled ?? config.OTEL_ENABLED;
  if (!enabled) return async () => {};

  const exporter = new OTLPTraceExporter({
    url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const sdk = new NodeSDK({
    resource: Resource.default().merge(
      new Resource({
        [ATTR_SERVICE_NAME]: config.OTEL_SERVICE_NAME,
      })
    ),
    traceExporter: exporter,
  });

  sdk.start();
  started = true;

  return async () => {
    if (!started) return;
    started = false;
    await sdk.shutdown().catch(() => undefined);
  };
}
