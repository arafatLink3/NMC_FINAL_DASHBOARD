#!/usr/bin/env node
// Build all packages, then deploy web to Supabase Hosting
// and the Fastify server to the configured Node host.
//
// Required env:
//   SUPABASE_PROJECT_REF      e.g. abcdefghijkl
//   SUPABASE_ACCESS_TOKEN     from https://supabase.com/dashboard/account/tokens
//   SERVER_DEPLOY_HOOK        (optional) Render/Railway/Fly deploy hook URL
//   SERVER_IMAGE_NAME         (optional) e.g. ghcr.io/arafatlink3/nmc-server
//   SERVER_IMAGE_TAG          (optional) e.g. latest (default: $GITHUB_SHA or ts)
//
// Usage:
//   node deploy.mjs [--skip-server] [--skip-web] [--dry-run]
//                   [--docker-server]        build + push container, then trigger hook
//                   [--container-only]       skip Supabase; just build & push the image

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const skipServer = args.has("--skip-server");
const skipWeb = args.has("--skip-web");
const dryRun = args.has("--dry-run");
const dockerServer = args.has("--docker-server");
const containerOnly = args.has("--container-only");
const env = process.env;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const packages = [
  "@nmc/ai",
  "@nmc/api-client",
  "@nmc/store",
];

function run(cmd, cmdArgs, opts = {}) {
  const label = `${cmd} ${cmdArgs.join(" ")}`;
  if (dryRun) {
    console.log(`[dry-run] ${label}`);
    return 0;
  }
  console.log(`\n▶ ${label}`);
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: true, cwd: here, ...opts });
  return res.status ?? 0;
}

function checkEnv(name) {
  if (!env[name]) {
    console.error(`✘ missing required env: ${name}`);
    process.exit(1);
  }
}

console.log("1) Building shared packages…");
for (const pkg of packages) {
  const code = run("pnpm", ["--filter", pkg, "run", "build"]);
  if (code !== 0) {
    console.error(`✘ ${pkg} build failed (exit ${code})`);
    process.exit(code);
  }
}

if (!skipWeb) {
  console.log("\n2) Building apps/web…");
  const code = run("pnpm", ["--filter", "@nmc/web", "run", "build"]);
  if (code !== 0) {
    console.error(`✘ @nmc/web build failed (exit ${code})`);
    process.exit(code);
  }
  if (!existsSync(resolve(here, "apps/web/dist/index.html"))) {
    console.error("✘ web build did not produce apps/web/dist/index.html");
    process.exit(1);
  }
}

if (!skipServer && !dockerServer) {
  console.log("\n3) Building server…");
  const code = run("pnpm", ["--filter", "@nmc/server", "run", "build"]);
  if (code !== 0) {
    console.error(`✘ @nmc/server build failed (exit ${code})`);
    process.exit(code);
  }
  if (!existsSync(resolve(here, "server/dist/server.js"))) {
    console.error("✘ server build did not produce server/dist/server.js");
    process.exit(1);
  }
}

if (dockerServer && !skipServer) {
  console.log("\n3) Building server container…");
  const imageName = env.SERVER_IMAGE_NAME ?? "nmc-server";
  const imageTag = env.SERVER_IMAGE_TAG ?? (env.GITHUB_SHA?.slice(0, 7) ?? String(Date.now()));
  const fullImage = `${imageName}:${imageTag}`;
  const buildCode = run("docker", [
    "build",
    "-f",
    "server/Dockerfile",
    "-t",
    fullImage,
    ".",
  ]);
  if (buildCode !== 0) {
    console.error(`✘ docker build failed (exit ${buildCode})`);
    process.exit(buildCode);
  }
  // Local smoke test before push.
  const smokeCode = run("docker", [
    "run",
    "--rm",
    "--name",
    "nmc-server-smoke",
    "-p",
    "4010:4000",
    "-e",
    "PORT=4000",
    "-e",
    "DB_CLIENT=sqlite",
    "-e",
    "DB_FILENAME=:memory:",
    "-e",
    "RUN_MIGRATIONS=false",
    "-e",
    "RUN_SEED=false",
    "-e",
    "JWT_ACCESS_SECRET=dev-access-secret",
    "-e",
    "JWT_REFRESH_SECRET=dev-refresh-secret",
    "-e",
    "CORS_ORIGIN=http://localhost:5173",
    "-d",
    fullImage,
  ]);
  if (smokeCode !== 0) {
    console.error("✘ docker smoke run failed");
    process.exit(smokeCode);
  }
  // Give it 3 s to come up, then curl /health, then kill.
  await sleep(3000);
  const probe = run("docker", ["exec", "nmc-server-smoke", "curl", "-fsS", "http://127.0.0.1:4000/health"]);
  run("docker", ["rm", "-f", "nmc-server-smoke"]);
  if (probe !== 0) {
    console.error("✘ /health probe failed inside container");
    process.exit(probe);
  }
  console.log(`✔ container ${fullImage} boots and responds to /health`);
  // Push if a registry is configured.
  if (env.SERVER_IMAGE_NAME) {
    const pushCode = run("docker", ["push", fullImage]);
    if (pushCode !== 0) {
      console.error(`✘ docker push failed (exit ${pushCode})`);
      process.exit(pushCode);
    }
    env.__PUSHED_IMAGE__ = fullImage;
  }
}

if (!containerOnly && !dryRun) {
  console.log("\n4) Deploying web to Supabase Hosting…");
  checkEnv("SUPABASE_PROJECT_REF");
  checkEnv("SUPABASE_ACCESS_TOKEN");
  const linkCode = run("supabase", [
    "link",
    "--project-ref",
    env.SUPABASE_PROJECT_REF,
    "--password",
    env.SUPABASE_DB_PASSWORD ?? "",
  ]);
  if (linkCode !== 0) {
    console.error("✘ supabase link failed");
    process.exit(linkCode);
  }
  // supabase db push: apply migrations from supabase/migrations/ to remote.
  run("supabase", ["db", "push", "--include-all"]);
  // Deploy Edge Function.
  run("supabase", ["functions", "deploy", "nmc-api", "--no-verify-jwt"]);
  // Upload web bundle to Supabase Storage bucket used for Hosting.
  run("supabase", [
    "storage",
    "cp",
    "apps/web/dist",
    "ssr://nmc-web/index.html",
    "--recursive",
  ]);
}

if (!skipServer && !dryRun && env.SERVER_DEPLOY_HOOK) {
  console.log("\n5) Triggering server deploy…");
  const res = spawnSync("curl", ["-fsSL", "-X", "POST", env.SERVER_DEPLOY_HOOK], { stdio: "inherit" });
  if ((res.status ?? 0) !== 0) {
    console.error("✘ server deploy hook failed");
    process.exit(res.status ?? 1);
  }
}

console.log("\n✔ NMC Dashboard deploy pipeline finished.");