#!/bin/sh
# entrypoint.sh — invoked by tini inside the nmc-server container.
# Validates the env, runs migrations unless skipped, then exec the CMD.
set -eu

log() {
  printf '[entrypoint] %s\n' "$*"
}

: "${PORT:=4000}"
: "${HOST:=0.0.0.0}"
export PORT HOST

if [ -z "${DATABASE_URL:-}" ] && [ "${DB_CLIENT:-sqlite}" = "pg" ]; then
  log "DB_CLIENT=pg but DATABASE_URL is empty — refusing to boot"
  exit 1
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  log "running knex migrations…"
  node --enable-source-maps dist/bin/migrate.js || {
    log "migrations failed (set RUN_MIGRATIONS=false to skip)"
    exit 1
  }
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  log "seeding database…"
  node --enable-source-maps dist/bin/seed.js || log "seed step failed (continuing)"
fi

log "starting nmc-server on ${HOST}:${PORT}"
exec "$@"