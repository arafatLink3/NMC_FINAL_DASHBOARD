#!/usr/bin/env node
// Verifies all deploy artefacts exist before triggering `node deploy.mjs`.
// Exits non-zero if any required artefact is missing.

import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const must = [
  ["packages/ai/dist/index.js",            "shared @nmc/ai bundle"],
  ["packages/api-client/dist/index.js",    "shared @nmc/api-client bundle"],
  ["packages/store/dist/index.js",         "shared @nmc/store bundle"],
  ["apps/web/dist/index.html",             "SPA entrypoint"],
  ["apps/web/dist/assets",                 "SPA bundled assets dir"],
  ["apps/web/dist/_redirects",             "SPA fallback for React Router"],
  ["server/dist/server.js",                "Fastify server entrypoint"],
  ["server/dist/migrations",               "Knex migrations directory"],
  ["supabase/config.toml",                 "Supabase project config"],
  ["supabase/migrations/0001_nmc_rls.sql", "RLS policy migration"],
  ["supabase/functions/nmc-api/index.ts",  "Edge Function entrypoint"],
  ["SUPABASE.md",                          "Deployment guide"],
  ["server/Dockerfile",                    "Fastify server container"],
  ["server/.dockerignore",                 "Docker build exclusions"],
  ["server/scripts/docker/entrypoint.sh",  "Container entrypoint script"],
  ["render.yaml",                          "Render Blueprint"],
  ["docker-compose.yml",                   "Local Postgres + server stack"],
];

let ok = true;
for (const [rel, label] of must) {
  const abs = resolve(here, rel);
  const present = existsSync(abs);
  const size = present && statSync(abs).isDirectory() ? "(dir)" : present ? statSync(abs).size : 0;
  const tag = present ? "✔" : "✘";
  console.log(`${tag} ${label.padEnd(40)} ${rel} ${size ? "[" + size + " bytes]" : ""}`);
  if (!present) ok = false;
}

if (ok) {
  // Quick check that index.html references the Inter font + JS bundle.
  const html = readFileSync(resolve(here, "apps/web/dist/index.html"), "utf8");
  const hasInter = /Inter|fonts\.googleapis\.com/.test(html);
  const hasScript = /<script[^>]*src="\/assets\//.test(html);
  console.log(`\nInter font present: ${hasInter ? "✔" : "✘"}`);
  console.log(`Bundled JS linked:   ${hasScript ? "✔" : "✘"}`);
  if (!hasInter || !hasScript) ok = false;
}

process.exit(ok ? 0 : 1);