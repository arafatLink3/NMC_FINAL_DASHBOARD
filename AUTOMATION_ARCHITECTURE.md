# Automation Architecture — NMC Dashboard Management

> **Program:** Operational Automation & R&D Initiative for Telecom Infrastructure
> **Scope:** NMC (Network Monitoring Center) portal — `apps/web`, `apps/mobile`, `server`, `packages/{ai,api-client,store,ui}`, Supabase Hosting + Edge Functions.
> **Status:** v0.1 — architecture baseline. Aligned with the existing monorepo (see `nmc-monorepo/README.md`, `nmc-monorepo/SUPABASE.md`, `nmc-monorepo/render.yaml`, `nmc-monorepo/docker-compose.yml`).

---

## 1. Executive Summary

The NMC portal runs three operational realities at once:

1. **A live telecom NOC view** (rosters, contacts, links, BRAS inventory, ongoing change windows).
2. **A reactive duty desk** that ingests CCB/NCR/PID notices by email and must publish structured rows to the dashboard within minutes.
3. **A growing R&D surface** for experimenting with rule-based and (later) ML/LLM-assisted automation.

The automation architecture layers on top of the existing monorepo without disrupting the "faithful port" of the legacy `NMC Dashboard/js/*` and `controllers|models|migrations|routes` code. Every existing job in `server/src/scheduler.ts` (CCB poller, weekly/monthly report) becomes a first-class **Automation Workflow** with telemetry, retries, and feature flags, and new workflows (BRAS reconciliation, roster parsing, anomaly detection, self-healing notifications) plug into the same runner.

The recommended production topology is the **Hybrid** topology already documented in `SUPABASE.md` §8:

- **SPA** (web) on **Supabase Hosting** (CDN, SPA fallback via `apps/web/public/_redirects`).
- **Fastify/Express API** on **Render/Fly/Railway** (`server/Dockerfile`) — long-lived TCP for IMAP/SMTP/OTel.
- **Supabase Edge Function** `nmc-api` as a read-only proxy for `/v1/rosters/current`, `/v1/ccb`, `/v1/contacts`.
- **Supabase Postgres** (with Knex migrations mirrored as pure SQL in `supabase/migrations/`).
- **Jaeger** for distributed tracing via OpenTelemetry.

---

## 2. Goals & Non-Goals

### 2.1 Goals

| # | Goal | Measurable outcome |
|---|------|--------------------|
| G1 | Cut operator toil on CCB/NCR/PID intake | Median parse → publish latency ≤ 90 s |
| G2 | Make every background job observable | 100 % of scheduled jobs emit OTel spans + status rows |
| G3 | Decouple automation from UI | `packages/ai` and `server/src/modules/*` ship without web changes |
| G4 | Enable safe experimentation | Feature-flagged R&D workflows isolated to a `dryRun` mode |
| G5 | Single source of truth for data | One Postgres schema, one migrations folder, one seed |
| G6 | Zero-touch deploys | `node deploy.mjs --docker-server` is the canonical release path |

### 2.2 Non-Goals (this iteration)

- Replacing ImapFlow/nodemailer with Edge Functions (150 ms CPU cap, no persistent TCP — see `SUPABASE.md` §4).
- Real-time streaming of NMS telemetry (planned, see §11 R&D roadmap).
- Multi-tenant isolation beyond Supabase RLS.

---

## 3. Guiding Principles

1. **Port, don't rewrite.** Behavior parity with legacy `NMC Dashboard/` is contractual.
2. **Automate the boring, instrument the rest.** Every automation has metrics, logs, traces.
3. **One workflow, one file.** A workflow lives in `server/src/workflows/<name>.ts` and exports a typed `run(ctx)` + `schedule`.
4. **Idempotent by default.** Every writer must be safe to re-run for the same input window.
5. **Fail soft, alert loud.** A failed workflow never crashes the scheduler; it emits a span with `status=ERROR` and bumps a counter.
6. **R&D lives behind a flag.** `config.AUTOMATION_RND_ENABLED=false` disables every experimental workflow without code changes.
7. **Schema-first.** Migrations land in `server/src/migrations/` (Knex) **and** mirror into `supabase/migrations/*.sql` before any workflow depends on the column.

---

## 4. Layered Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                               │
│   apps/web (Next.js 14, App Router)         apps/mobile (Expo / RN)      │
│   packages/ui shared components            packages/store (IDB / Async) │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ HTTPS (api-client, RLS-aware anon JWT)
┌──────────────────────────────▼───────────────────────────────────────────┐
│                          EDGE / API LAYER                                │
│  ┌────────────────────────────┐    ┌──────────────────────────────────┐   │
│  │  Supabase Edge Function    │    │  Fastify/Express API (server/)   │   │
│  │  supabase/functions/nmc-api│    │  src/app.ts, src/server.ts       │   │
│  │  /health, /v1/rosters, …   │    │  routes/{bras,api,import,…}      │   │
│  └──────────────┬─────────────┘    └────────────────┬─────────────────┘   │
└─────────────────┼──────────────────────────────────┼─────────────────────┘
                  │                                   │
┌─────────────────▼───────────────────────────────────▼─────────────────────┐
│                        AUTOMATION / WORKFLOW LAYER                        │
│  server/src/workflows/   • ccb-imap-poll      • bras-reconcile             │
│                          • weekly-report      • monthly-report            │
│                          • roster-import      • anomaly-detect (R&D)      │
│                          • nms-link-probe     • self-heal-alerts (R&D)    │
│  packages/ai (pure-TS rule engine)                                          │
│  server/src/scheduler.ts (tick loop + dependency injection)                │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────────────────────────────┐
│                          INTEGRATION LAYER                                │
│   mail/  (ImapFlow, nodemailer)   bras/  (BRAS import controller)         │
│   storage/ (S3-compatible)        modules/ai (LLM adapters — future)      │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
┌─────────────────▼─────────────────────────────────────────────────────────┐
│                          DATA & OBSERVABILITY                             │
│   Supabase Postgres (RDS / Docker)   Jaeger (OTLP 4317/4318)              │
│   Redis (optional queue, v0.2)        Loki/Prom (optional, v0.2)          │
└──────────────────────────────────────────────────────────────────────────┘
```

The four layers map cleanly to the existing folders:

| Layer | Existing path |
|------|--------------|
| Presentation | `apps/web`, `apps/mobile`, `packages/ui`, `packages/store` |
| Edge / API | `server/src/app.ts`, `server/src/server.ts`, `supabase/functions/nmc-api/` |
| Automation | `server/src/scheduler.ts` + new `server/src/workflows/*` |
| Integration | `server/src/modules/{mail,bras,ai}/`, `server/src/modules/storage/` |
| Data | `server/src/db.ts`, `server/src/migrations/`, `supabase/migrations/` |
| Observability | `server/src/telemetry.ts`, `OTEL_EXPORTER_OTLP_ENDPOINT` |

---

## 5. Workflow Catalog

Every workflow is a TypeScript module exporting `{ name, schedule, run, enabled }`. The scheduler (`server/src/scheduler.ts`) is the runtime; new workflows register via `registerWorkflow()` so adding a job is one line.

| ID | Workflow | Trigger | Inputs | Outputs | Current status |
|----|----------|---------|--------|---------|----------------|
| W1 | `ccb-imap-poll` | Every 5 min | IMAP mailbox (`MAIL_FETCH_BOX`) | `ccb_rows` table | **Existing** (port of scheduler.ts) |
| W2 | `weekly-report` | Sun 23:00 local | `incidents`, `tickets` (last 7 d) | SMTP send + `reports` row | **Existing** |
| W3 | `monthly-report` | Last day 23:00 local | `incidents`, `tickets` (MTD) | SMTP send + `reports` row | **Existing** |
| W4 | `bras-reconcile` | Hourly | `bras_list _demu.csv` vs `bras_records` | Diff → `bras_drift` table | **New (v0.2)** |
| W5 | `roster-import` | File watcher / manual | Excel/CSV in `data/seed-roster-csv.csv` | `roster_*` tables | **New (v0.2)** |
| W6 | `nms-link-probe` | Every 10 min | `data/nms-links.json` | `nms_link_status` | **New (v0.3, R&D)** |
| W7 | `anomaly-detect` | Every 15 min | recent `incidents` | `anomalies` table | **New (v0.4, R&D)** |
| W8 | `self-heal-alerts` | On incident close | tickets | SMTP/SMS if SLA breach | **New (v0.4, R&D)** |

### 5.1 Workflow contract

```ts
// server/src/workflows/types.ts
export interface WorkflowContext {
  db: Knex;
  config: Config;
  mailFetcher: MailFetcher;
  mailer: Mailer;
  tracer: Tracer;            // OpenTelemetry
  logger: pino.Logger;
  dryRun: boolean;            // mirrors AUTOMATION_RND_ENABLED
}

export interface Workflow<I = unknown, O = unknown> {
  name: string;
  schedule: string;           // cron-like, parsed by scheduler
  enabled(ctx: WorkflowContext): boolean;
  run(ctx: WorkflowContext, input?: I): Promise<O>;
  onError?(err: unknown, ctx: WorkflowContext): Promise<void>; // alert hook
}
```

Each run is wrapped in a span: `nmc.workflow.<name>` with attributes `workflow.name`, `workflow.dryRun`, `workflow.durationMs`, `workflow.recordsAffected`.

---

## 6. Critical Existing Workflows (do not break)

These run today. The automation initiative **wraps and instruments** them — it does not refactor their semantics.

### 6.1 CCB IMAP poller — `ccb-imap-poll`

- Source: `server/src/scheduler.ts` → `pollCcb()`.
- Parses `CCB_REGEX`, `TIME_RANGE_REGEX`, `ZONE_REGEX` to extract `{ type, ref, title, start, end, zone, contact }`.
- Writes JSON payload into `ccb_rows.data` with `source: 'imap'`.
- **Automation lift:** wrap in span, dedupe by `messageId` (currently dedupe is by `ref` only — a real risk for re-sent mails), persist last-seen cursor in `imap_cursor(messageId, seenAt)`, expose a manual `POST /api/workflows/ccb-imap-poll/run` for on-demand ingest.

### 6.2 Weekly / Monthly reports

- Source: `runWeeklyReport`, `runMonthlyReport`.
- Aggregate `incidents`/`tickets`, group by `data.category`, email via `mailer.send()`.
- **Automation lift:** persist report body to `reports` table, attach a downloadable PDF/HTML, add a Slack/Teams webhook adapter next to SMTP, and ship the rendered summary to the Edge Function cache so the SPA can show last week's numbers offline.

### 6.3 BRAS import — `brasImportController.js`

- Source: `NMC Dashboard/controllers/brasImportController.js`, route `routes/brasImport.js`.
- CSV/Excel ingest into `BrasRecord` (model `models/BrasRecord.js`).
- **Automation lift:** wrap as `bras-reconcile` (W4), generate drift reports, and add a backfill command for migrations.

---

## 7. AI / R&D Pipeline

The R&D initiative targets the **Automation Layer** specifically — it never reaches into the UI layer.

### 7.1 Today's rule engine — `packages/ai`

- Pure TypeScript, framework-agnostic, faithful port of `NMC Dashboard/js/ai.js`.
- Currently drives dropdown defaults, roster interpretation, BRAS validation hints.
- Consumes inputs from `packages/api-client` and emits typed `Suggestion` objects.

### 7.2 Tomorrow — layered intelligence

```
   ┌──────────────────────────────────────────────────────────────┐
   │                      R&D PIPELINE                            │
   │                                                              │
   │   raw events (IMAP, BRAS, NMS, tickets)                      │
   │              │                                               │
   │              ▼                                               │
   │   ┌──────────────────┐   ┌──────────────────────────────┐    │
   │   │ Rule engine      │   │ ML adapters (server-side)     │    │
   │   │ packages/ai      │   │  • LLM triage (CCB subject)   │    │
   │   │ deterministic    │   │  • Anomaly model (incidents)  │    │
   │   └────────┬─────────┘   │  • Time-series forecast       │    │
   │            │             └──────────────┬───────────────┘    │
   │            ▼                            ▼                    │
   │           Scoring / arbitration layer (workflow context)      │
   │                            │                                  │
   │                            ▼                                  │
   │                Action: write to Postgres / send alert         │
   │                                                              │
   └──────────────────────────────────────────────────────────────┘
```

- **Phase 0 (now):** rule engine only; no LLM call. Used to ship `bras-reconcile` and `roster-import` reliably.
- **Phase 1 (R&D):** add LLM triage for CCB mails with regex fallback. Provider pluggable via `modules/ai/adapters/{openai,azure,local}.ts`. PII redaction happens **before** the call.
- **Phase 2 (R&D):** anomaly detection on rolling 30-day incident counts.
- **Phase 3 (R&D):** reinforcement loop — operators mark suggestions "useful / not useful" and we re-rank.

### 7.3 Sandbox guardrails

- Every R&D workflow runs under `dryRun=true` by default and writes to `anomalies_sandbox` instead of `anomalies`.
- Promotion requires two consecutive weeks of "agreement with rule-engine baseline" > 90 %.
- All LLM calls log the **prompt hash** and **response hash** (never the raw payload) for audit.

---

## 8. Integration Layer

### 8.1 Mail (`server/src/modules/mail/`)

- `imap.ts` — ImapFlow wrapper behind `MailFetcher` interface.
- `mailer.ts` — nodemailer/SMTP wrapper behind `Mailer` interface.
- **Today:** Outlook 365 (`OUTLOOK_SMTP_HOST`, `OUTLOOK_IMAP_HOST`).
- **Automation lift:** add a generic provider registry so a second ISP / on-prem Exchange can be onboarded by config, not code.

### 8.2 BRAS (`server/src/modules/bras/`)

- Inherits legacy `NMC Dashboard/controllers/brasController.js` and `brasImportController.js`.
- New `bras-reconcile` workflow compares the supplier CSV (`bras_list _demu.csv`) against live `bras_records` rows.

### 8.3 Storage (`server/src/modules/storage/`)

- Local disk today; S3-compatible abstraction in place.
- Automation artefacts (drift reports, anomaly snapshots) default to local with `STORAGE_BACKEND=s3` override.

### 8.4 External NMS links (`data/nms-links.json`)

- Read-only catalog of vendor NMS URLs surfaced in the UI.
- New `nms-link-probe` (W6) will headless-fetch and assert 2xx + expected title, surfacing "stale link" alerts to operators.

---

## 9. Data Layer

### 9.1 Schema ownership

- **Source of truth:** `server/src/migrations/*.js` (Knex).
- **Supabase mirror:** `supabase/migrations/*.sql` (pure SQL).
- `SUPABASE.md` §3 mandates a mirror workflow before any feature depends on a column.

### 9.2 New tables for automation

| Table | Purpose | Migration |
|-------|---------|-----------|
| `workflow_runs` | One row per workflow execution: name, started_at, finished_at, status, records_affected | `0002_workflow_runs.sql` |
| `ccb_cursor` | Last processed `messageId` per mailbox | `0002_workflow_runs.sql` |
| `bras_drift` | Diff rows from `bras-reconcile` | `0003_bras_drift.sql` |
| `nms_link_status` | Last probe time + status per link | `0004_nms_link_status.sql` |
| `anomalies` / `anomalies_sandbox` | R&D anomaly detections | `0005_anomalies.sql` |
| `reports` | Persisted weekly/monthly report bodies | `0006_reports.sql` |

All new tables get **RLS** in `supabase/migrations/0001_nmc_rls.sql` (extended) — `viewer` may SELECT, `operator` may UPDATE incident lifecycle columns, `admin` is the only role that can `INSERT` into `anomalies` (production table; sandbox is writable by all authenticated roles).

### 9.3 Backfill & seed

- `pnpm --filter server db:seed` populates the BRAS demo data and the roster CSV templates in `data/`.
- All automation workflows must read from the seeded fixtures in CI to prevent drift.

---

## 10. Security & Compliance

- **Auth:** JWT (access + refresh), bcrypt, role-based (`admin`, `operator`, `viewer`) — already enforced at the API and mirrored as Supabase RLS.
- **Secrets:** never in repo. `.env.example` is the contract; CI fails if any var in `SUPABASE.md` §1 is missing at deploy time.
- **PII redaction:** before any LLM call, the `redact()` helper in `packages/ai/src` strips emails, phone numbers, customer names, and BRAS IDs to tokens of the form `<EMAIL_1>`, `<PHONE_2>`.
- **Audit trail:** every workflow write goes through a `withAudit()` Knex helper that stamps `created_by`, `created_at`, `source_workflow`.
- **Mail safety:** outbound SMTP is rate-limited to 60 msg/min to avoid tripping Outlook throttling.
- **Dependency hygiene:** Renovate/Dependabot on `pnpm-lock.yaml`, weekly `pnpm audit` in CI.

---

## 11. Observability

`server/src/telemetry.ts` already wires the OpenTelemetry SDK to OTLP. Automation extends it with:

- **Per-workflow spans:** `nmc.workflow.<name>` with attributes as in §5.1.
- **Counters:** `nmc.workflow.runs.total{status}`, `nmc.workflow.records.total{workflow}`.
- **Gauges:** `nmc.scheduler.next_run.seconds{workflow}`.
- **Logs:** pino structured logs correlated by `traceId`.

Dashboards live in Jaeger (spans) and a future Grafana panel backed by Prometheus remote write from the counters. The minimum viable dashboard surfaces:

1. Workflow success rate (last 24 h).
2. Median p50/p95 run duration per workflow.
3. Failed-workflow alert feed (last 7 days).
4. CCB ingest latency (mail received → row published).

---

## 12. Deployment & Release

The release pipeline is the one already in `nmc-monorepo/package.json` and `SUPABASE.md` §2.

```powershell
# canonical release
node deploy.mjs --docker-server

# web-only hotfix
node deploy.mjs --skip-server

# R&D dry-run deploy (no server touched)
node deploy.mjs --skip-server --docker-server
```

Release gates (CI, in order):

1. `pnpm typecheck` — all packages green.
2. `pnpm test` (Vitest) — unit + workflow tests must pass.
3. `pnpm verify:deploy` — boots docker-compose stack, hits `/health`, runs one cycle of each workflow, tears down.
4. Image build (`server/Dockerfile`).
5. `pnpm audit --prod` — no high/critical CVEs.
6. Promote image to registry → trigger `SERVER_DEPLOY_HOOK`.

For R&D branches, gate 3 also runs `dryRun=true` and asserts no writes to production tables.

---

## 13. Operational Runbook (excerpt)

| Symptom | First check | Likely cause |
|---------|-------------|--------------|
| CCB rows stale > 15 min | Jaeger span `nmc.workflow.ccb-imap-poll` last status | IMAP credential rotated; `OUTLOOK_IMAP_PASS` expired |
| Weekly report missing in inbox | `reports` table latest row; `mailer.enabled` | SMTP throttled — check `nmc.mailer.sent.total` |
| BRAS drift spike | `bras_drift` last hour count | Supplier CSV format changed — see `bras-reconcile` logs |
| Edge Function 5xx | Supabase logs for `nmc-api` | `SUPABASE_SERVICE_ROLE_KEY` rotated |

`node verify-deploy.mjs` is the smoke test that catches 80 % of these before a human sees them.

---

## 14. R&D Roadmap

| Quarter | Milestone | Workflow(s) |
|---------|-----------|-------------|
| Now | Wrap existing scheduler jobs as Workflows; add `workflow_runs` | W1, W2, W3 |
| +4 w | BRAS reconciliation; roster import automation | W4, W5 |
| +8 w | NMS link probe; on-call rotation integration | W6 |
| +12 w | LLM-assisted CCB triage (sandbox) | W7 |
| +16 w | Anomaly detection on incident counts | W7 |
| +20 w | Self-healing alerts (Slack/Teams, SMS) | W8 |
| +24 w | R&D promotion gate automated; remove `dryRun` for graduated workflows | All |

Each milestone ends with a **promotion review** (see §7.3) before any workflow flips to production mode.

---

## 15. Open Questions

- Do we want a queue (Redis/BullMQ) or is the existing in-process scheduler enough for ≤ 1 job/min?
- Will NMS telemetry arrive via webhook, file drop, or SNMP trap?
- Is there an existing incident-management system we should integrate with instead of inventing `incidents` / `tickets`?
- Supabase RLS policies for the new automation tables — confirm with security review.

---

*Owner: NMC Platform Team. Reviewers: Operations Lead, Security, Data. Next review: end of current sprint.*
