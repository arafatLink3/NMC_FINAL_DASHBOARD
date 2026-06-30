# syntax=docker/dockerfile:1.7
# NMC Dashboard — Fastify server image.
# Multi-stage build: pnpm install + tsc in the builder, slimmer runtime.
# Build:   docker build -f server/Dockerfile -t nmc-server:dev .
# Run:     docker run --rm -p 4000:4000 --env-file server/.env nmc-server:dev

ARG NODE_VERSION=20.14.10

# ──────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: install pnpm, full workspace, build shared + server
# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS builder
ENV CI=true \
    PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH \
    NODE_ENV=production
WORKDIR /repo

# OS deps for native modules (sqlite3, bcryptjs, pg).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates python3 build-essential \
 && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack (pinned by packageManager in package.json).
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy lockfile + workspace manifests first so the install layer caches well.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY packages packages
COPY apps apps
COPY server server

# Frozen install so the lockfile is authoritative.
RUN pnpm install --frozen-lockfile --filter @nmc/server... --filter @nmc/web...

# Build the shared packages + the server bundle.
RUN pnpm --filter @nmc/ai --filter @nmc/api-client --filter @nmc/store run build
RUN pnpm --filter @nmc/server run build

# Prune dev dependencies for the runtime image.
RUN pnpm --filter @nmc/server deploy /deploy/server \
      --prod \
      --target=node20 \
      --no-frozen-lockfile

# ──────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime: production-only deps, dist + workspaces
# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app

# Minimal OS libs for sqlite3 native binary + ca certs for TLS (Supabase, IMAP).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nmc \
 && useradd  --system --uid 1001 --gid nmc --home /app nmc

# Bundled deploy produced by `pnpm deploy /deploy/server` above.
COPY --from=builder --chown=nmc:nmc /deploy/server /app
COPY --from=builder --chown=nmc:nmc /repo/server/dist ./dist
COPY --from=builder --chown=nmc:nmc /repo/server/migrations ./migrations
COPY --from=builder --chown=nmc:nmc /repo/server/scripts/docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Persist SQLite file when DB_CLIENT=sqlite (unused on Supabase Postgres).
RUN mkdir -p /app/data && chown -R nmc:nmc /app
VOLUME ["/app/data"]
USER nmc

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:${PORT}/health || exit 1

# tini reaps zombies; node --enable-source-maps gives readable stack traces.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]


# ──────────────────────────────────────────────────────────────────────────
# Stage 3 — dev: includes the full workspace and source maps for `pnpm dev`
# ──────────────────────────────────────────────────────────────────────────
FROM runtime AS dev
ENV NODE_ENV=development
USER root
COPY --from=builder --chown=nmc:nmc /repo /repo
USER nmc
WORKDIR /repo/server
CMD ["node", "--enable-source-maps", "--watch", "dist/server.js"]


# ──────────────────────────────────────────────────────────────────────────
# Stage 4 — migrate: one-shot runner for `pnpm migrate` / `pnpm seed`
# Usage:  docker run --rm --env-file server/.env nmc-server:migrate migrate
# ──────────────────────────────────────────────────────────────────────────
FROM runtime AS migrate
USER root
COPY --from=builder --chown=nmc:nmc /repo/server/src/bin ./bin
USER nmc
CMD ["node", "--enable-source-maps", "dist/bin/migrate.js"]
