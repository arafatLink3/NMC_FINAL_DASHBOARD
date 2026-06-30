# Supabase deployment

This server is dialect-agnostic: it runs against a local SQLite file by
default and against a Postgres instance (self-hosted, Docker, AWS RDS,
**Supabase**) when configured with `DB_CLIENT=pg`.

## Quick start (Supabase)

1. Create a project at <https://supabase.com>.
2. **Settings → Database → Connection string → Transaction (or Session) pooler** —
   copy the URI. It looks like:

   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

3. Set the env var:

   ```bash
   export SUPABASE_DATABASE_URL="postgresql://postgres.abcdef:...@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
   ```

4. Boot the server. The factory in `src/db.ts` detects `SUPABASE_DATABASE_URL`
   and uses it as the Knex `connection`. Migrations run automatically on
   startup (see `src/db/migrate.ts`) using the same compiled `.js` files
   from `dist/migrations/`.

5. (Optional) Disable SSL when targeting a plain local Postgres:

   ```bash
   export NMC_DB_SSL=disable
   ```

## What stays the same

- Knex migrations are written dialect-safe (`t.json('x')`, `defaultTo(knex.fn.now())`).
- The Azure AD user-provisioning migration (`20260627090003_add_azure_columns_to_users`)
  branches on `knex.client.dialect` so SQLite + Postgres both work.
- The `onConflict(['uid','mailbox']).merge([...])` upsert in
  `MailRepository` works on Postgres out of the box (SQLite needs the
  `3.24+` JSON1 extension which is shipped by every modern build).

## Self-hosted Postgres (no Supabase)

Set `DB_CLIENT=pg` plus the usual `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`. The server prefers `SUPABASE_DATABASE_URL`
when set, then falls back to those fields.

## Local Postgres via Docker

```bash
docker run --name nmc-pg -e POSTGRES_PASSWORD=nmc -e POSTGRES_USER=nmc -e POSTGRES_DB=nmc -p 5432:5432 -d postgres:16
export DB_CLIENT=pg
export DB_HOST=localhost
export DB_USER=nmc
export DB_PASSWORD=nmc
export DB_NAME=nmc
export NMC_DB_SSL=disable
```

## Verifying

```bash
pnpm --filter @nmc/server migrate          # one-shot migration
pnpm --filter @nmc/server start            # boots Fastify against Supabase
```

The first request to `/health` will return 200 if the pool can reach
the database. Watch the boot logs for `knex: migrations ran`.