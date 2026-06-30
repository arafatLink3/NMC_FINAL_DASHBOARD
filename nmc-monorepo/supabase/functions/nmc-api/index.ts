// Supabase Edge Function: nmc-api
// Mirrors the Fastify HTTP surface for read-only endpoints.
// Pushes the IMAP/SMTP/OTel pipeline back to the long-lived Node server
// (Render/Fly/Railway); this Edge Function handles public reads + health.
//
// Deploy:  supabase functions deploy nmc-api --no-verify-jwt
// Invoke:  https://<project>.supabase.co/functions/v1/nmc-api/health

// @ts-expect-error - Deno deploy provides these globals at runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOW_ORIGIN = Deno.env.get("ALLOW_ORIGIN") ?? "https://nmc.example.com";

const cors = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Vary": "Origin",
  ...extra,
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: cors({ "content-type": "application/json" }) });

const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  if (url.pathname.endsWith("/health")) {
    return json({ ok: true, service: "nmc-api", ts: new Date().toISOString() });
  }

  if (url.pathname.endsWith("/v1/rosters/current")) {
    const dept = url.searchParams.get("dept") ?? "all";
    const { data, error } = await db
      .from("roster_shifts")
      .select("id, dept, slot, weekday, week_index, engineers, month_label")
      .eq("month_label", (new Date().toISOString().slice(0, 7)))
      .limit(500);
    if (error) return json({ error: error.message }, 500);
    const filtered = dept === "all" ? data : data?.filter((r) => r.dept === dept);
    return json({ ok: true, rows: filtered ?? [] });
  }

  if (url.pathname.endsWith("/v1/ccb")) {
    const { data, error } = await db
      .from("ccb_records")
      .select("id, status, subject, opened_at, closed_at, severity, owner")
      .order("opened_at", { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, rows: data ?? [] });
  }

  if (url.pathname.endsWith("/v1/contacts")) {
    const { data, error } = await db
      .from("contacts")
      .select("id, name, role, dept, email, phone, escalation")
      .order("dept", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, rows: data ?? [] });
  }

  return json({ error: "not found", path: url.pathname }, 404);
});