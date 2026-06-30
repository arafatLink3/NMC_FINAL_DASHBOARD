# NMC Dashboard — Supabase Hosting Guide

This monorepo builds into five artefacts, each deployed independently:

| Artefact            | Source                       | Built output             | Hosting target                          |
| ------------------- | ---------------------------- | ------------------------ | --------------------------------------- |
| Web SPA             | `apps/web/`                  | `apps/web/dist/`         | **Supabase Hosting** (static + CDN)     |
| Fastify API server  | `server/`                    | `server/dist/`           | External Node host (Render / Fly / Railway) |
| Edge proxy          | `supabase/functions/nmc-api/` | Edge Function bundle   | **Supabase Edge Functions**             |
| Postgres schema     | `server/src/migrations/`     | SQL files               | **Supabase Postgres** via `supabase db push` |
| RLS policies        | `supabase/migrations/0001_nmc_rls.sql` | SQL            | **Supabase Postgres**                   |
| Server container    | `server/Dockerfile`          | Docker image `nmc-server` | Render / Fly.io / Railway (auto-detected) |

The pipeline is wired through `deploy.mjs` at the repo root.

---

## 1. One-time setup

```powershell
# install Supabase CLI (Windows / scoop)
scoop install supabase

# log in to Supabase
supabase login

# link the monorepo to your project
supabase link --project-ref <your-project-ref>
```

Create `.env` files at the right scope (never commit them):

**`apps/web/.env.production`**
```
VITE_API_BASE_URL=https://nmc.example.com
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**`server/.env`**
```
NODE_ENV=production
PORT=8080
HOST=0.0.0.0

# Supabase Postgres (use the pooler in production)
DATABASE_URL=postgres://postgres:<db-password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DATABASE_DIRECT_URL=postgres://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres

# Auth
JWT_SECRET=<32-byte base64 secret>
COOKIE_SECRET=<32-byte base64 secret>

# SMTP / IMAP (Outlook)
OUTLOOK_SMTP_HOST=smtp.office365.com
OUTLOOK_SMTP_PORT=587
OUTLOOK_SMTP_USER=alerts@nmc.example.com
OUTLOOK_SMTP_PASS=<app-password>
OUTLOOK_IMAP_HOST=outlook.office365.com
OUTLOOK_IMAP_PORT=993
OUTLOOK_IMAP_USER=alerts@nmc.example.com
OUTLOOK_IMAP_PASS=<app-password>

# OpenTelemetry (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com:4318

# CORS allowlist for the SPA
ALLOW_ORIGIN=https://nmc.example.com
```

---

## 2. Build everything

```powershell
node deploy.mjs --dry-run        # preview the steps
node deploy.mjs --skip-server    # build only the SPA
node deploy.mjs --skip-web       # build only the API server
node deploy.mjs                  # build all
```

`deploy.mjs` runs, in order:

1. `pnpm --filter @nmc/ai --filter @nmc/api-client --filter @nmc/store run build`
2. `pnpm --filter @nmc/web run build` → `apps/web/dist/`
3. `pnpm --filter @nmc/server run build` → `server/dist/`
4. `supabase link`, `supabase db push`, `supabase functions deploy nmc-api`, `supabase storage cp` to publish the SPA bundle to Supabase Hosting.
5. If `SERVER_DEPLOY_HOOK` is set, `curl -X POST <hook>` triggers the long-lived Node host.

---

## 3. Database migrations against Supabase Postgres

`server/src/migrations/` holds the Knex migrations (SQLite-flavoured). The recommended Supabase flow:

1. Mirror the schema into `supabase/migrations/` as pure Postgres SQL.
2. Apply with `supabase db push --include-all`.
3. Run Knex migrations once for any seed inserts the server depends on:

```powershell
cd server
$env:DATABASE_URL="postgres://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres"
pnpm migrate
pnpm seed
```

If you keep Knex as the source of truth, run migrations from your CI worker against `DATABASE_DIRECT_URL` (port 5432, not the pooler).

---

## 4. Edge Function: `nmc-api`

`súabase/functions/nmc-api/index.ts` is a Deno entrypoint exposing read-only endpoints (`/health`, `/v1/rosters/current`, `/v1/ccb`, `/v1/contacts`). It reads directly from Supabase Postgres using the service-role key, so the SPA can render without the Fastify server being up.

Deploy:
```powershell
supabase functions deploy nmc-api --no-verify-jwt
supabase functions secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
supabase functions secrets set ALLOW_ORIGIN=https://nmc.example.com
```

The Edge Function does **not** handle IMAP/SMTP/OTel — that pipeline stays on the long-lived Node server because Edge Functions cap at 150 ms CPU and don't support persistent TCP connections.

---

## 5. SPA fallback for React Router

`apps/web/public/_redirects` already contains the Supabase/Netlify-style SPA fallback:

```
/*    /index.html   200
```

Supabase Hosting honours `_redirects`. Without it, deep-links like `/dashboard` return 404. The file is shipped to `dist/` automatically because Vite treats `public/` as the static root.

---

## 6. Long-lived Node server (Docker)

`server/Dockerfile` is a four-stage image:

| Stage      | Purpose                                                              |
| ---------- | -------------------------------------------------------------------- |
| `builder`  | `node:20.14-bookworm-slim` + pnpm 9 → install workspace → build shared + server |
| `runtime`  | Same base, non-root user `nmc` (UID 1001), `tini` PID 1, healthcheck on `/health` |
| `dev`      | Re-attaches the source tree; `pnpm dev` reloads on changes           |
| `migrate`  | One-shot stage for `node dist/bin/migrate.js` — useful in CI          |

Build and run locally:

```powershell
docker build -f server/Dockerfile -t nmc-server:dev .
docker run --rm -p 4000:4000 --env-file server/.env nmc-server:dev
# or via compose (Postgres + server + adminer):
docker compose up --build
```

The entrypoint (`server/scripts/docker/entrypoint.sh`) honours three env flags:

| Flag               | Effect                                              |
| ------------------ | --------------------------------------------------- |
| `RUN_MIGRATIONS=true`  | runs Knex migrations on every boot (default `true`) |
| `RUN_SEED=false`       | seeds reference data only when `true`              |
| `PORT`, `HOST`         | passed through to Fastify                           |

Deploy with the new pipeline:

```powershell
# build the image and smoke-test /health before any registry push
node deploy.mjs --docker-server --skip-web

# build + push to a registry + trigger the platform deploy hook
$env:SERVER_IMAGE_NAME = "ghcr.io/arafatlink3/nmc-server"
$env:SERVER_IMAGE_TAG  = "v0.1.0"
$env:SERVER_DEPLOY_HOOK = "https://api.render.com/deploy/srv-.../?key=..."
node deploy.mjs --docker-server --skip-web
```

### Picking a host

- **Render** — drop `render.yaml` next to the repo; Render Blueprint reads `server/Dockerfile` and wires `PORT=4000`, healthcheck on `/health`, and `DATABASE_URL` as a secret. Set the Supabase pooler URL in the dashboard.
- **Fly.io** — `fly launch --no-deploy --dockerfile server/Dockerfile` then `fly secrets set DATABASE_URL=...`. The Dockerfile's `EXPOSE 4000` matches Fly's auto-detection.
- **Railway** — connect repo, override `Dockerfile Path = server/Dockerfile`, set `DATABASE_URL`, `JWT_*`, SMTP/IMAP in the Variables tab.

Whichever platform you pick, the healthcheck inside the image hits `http://127.0.0.1:4000/health` so the orchestrator only routes traffic to ready instances.

---

## 7. End-to-end smoke test

```powershell
# SPA health
curl https://nmc.example.com/

# Edge Function health
curl https://<project-ref>.supabase.co/functions/v1/nmc-api/health

# Server health (replace with your platform URL)
curl https://api.nmc.example.com/health

# Trigger migrations + seed
curl -X POST $SERVER_DEPLOY_HOOK
```

If all three return 200, the dashboard is live on Supabase Hosting with the Fastify server reachable from the SPA and the Edge Function serving public reads directly from Postgres.

---

## 8. Topologies at a glance

- **Static-only on Supabase** — SPA on Hosting, Edge Function reads from Supabase Postgres, no Fastify server. Limits: no live IMAP inbox, no SMTP, no telemetry export. Best for prototypes.
- **Hybrid (recommended)** — SPA on Hosting, Fastify on Render/Fly/Railway, Edge Function as a read-only proxy. IMAP/SMTP/OTel run on the Node host.
- **Everything on Supabase** — only feasible if you replace Fastify + ImapFlow + nodemailer with Edge Functions, which kills the mail pipeline. Not recommended.