# NMC Portal Monorepo

Single source of truth for the **Network Monitoring Center** portal:

| App / Package | Purpose |
| --- | --- |
| `apps/web` | **Next.js 14** App Router — production web portal |
| `apps/mobile` | **Expo / React Native** — Android **APK** + iOS |
| `packages/ui` | Cross-platform React components |
| `packages/ai` | Rule-based AI (port of `js/ai.js`) — pure TS, framework-agnostic |
| `packages/api-client` | Typed REST client (web + RN) |
| `packages/store` | Async key/value store (AsyncStorage on RN, IndexedDB on web) |
| `server` | **Node + Express + TypeScript + Sequelize + PostgreSQL + JWT-roles** API with **OpenTelemetry → Jaeger** tracing |

## Quick start

```bash
# 1. Install pnpm (if not present)
npm i -g pnpm

# 2. Install deps
pnpm install

# 3. Boot Postgres + Jaeger
pnpm infra:up

# 4. Run migrations + seed
pnpm --filter server db:migrate
pnpm --filter server db:seed

# 5. Dev (web + mobile + server in parallel)
pnpm dev
```

Open:

- Web — http://localhost:3000
- API — http://localhost:4000 (`/api/health`, `/api/auth/login`, …)
- Jaeger UI — http://localhost:16686

## Stack (defaults)

- **Frontend:** Next.js 14 (App Router, TS) + Expo SDK 51 (RN, TS) + shared `packages/ui`
- **Backend:** Node 20, Express 4, TypeScript, Sequelize 6, Knex migrations
- **DB:** PostgreSQL 16
- **Auth:** JWT (access + refresh), bcrypt, role-based (`admin`, `operator`, `viewer`)
- **Tracing:** OpenTelemetry SDK → OTLP → Jaeger (self-hosted via docker-compose)
- **Hosting:** API + Postgres + Web on **Render**; web also deployable to **Vercel**; mobile APK via **Expo EAS**

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   apps/web      │    │  apps/mobile    │
│   (Next.js)     │    │  (Expo / RN)    │
└────────┬────────┘    └────────┬────────┘
         │                      │
         │  ┌────────────────┐  │
         └──┤ packages/ui    ├──┘
            │ packages/ai    │
            │ packages/store │
            │ packages/api-  │
            │    client      │
            └────────┬───────┘
                     │  HTTPS / JSON
                     ▼
            ┌─────────────────────┐
            │      server/        │
            │  Express + TS + JWT │
            │  + Sequelize + OTel │
            └────────┬────────────┘
                     │
              ┌──────┴──────┐
              ▼             ▼
        PostgreSQL       Jaeger
        (docker / RDS)  (OTLP 4317)
```

## Faithful port

This is a **port**, not a rewrite. The AI rules, dropdown defaults, page behaviours, and BRAS wire-protocol are preserved 1-to-1 from the legacy `NMC Dashboard/js/...` and `NMC Dashboard/controllers|models|migrations|routes` directories.
