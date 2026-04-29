import { NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SCHEMA_SQL = `
create table if not exists public.work_status_runs (
  id          uuid        primary key default gen_random_uuid(),
  date        text        not null,
  run_id      text        not null unique,
  status      text        not null,
  results     jsonb       not null,
  created_at  timestamptz not null default now()
);

create index if not exists work_status_runs_created_at_idx
  on public.work_status_runs (created_at desc);

create index if not exists work_status_runs_run_id_idx
  on public.work_status_runs (run_id);

do $$ begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'work_status_runs'
  ) then
    raise notice 'Table missing — created above';
  end if;
end $$;
`.trim();

// Extract project ref from SUPABASE_URL (https://<ref>.supabase.co)
function getProjectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname; // <ref>.supabase.co
    return host.split(".")[0];
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  // Auth — MIGRATION_TOKEN (임시 일회용 토큰)
  const migrationToken = process.env.MIGRATION_TOKEN;
  const authHeader = req.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!migrationToken || provided !== migrationToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_URL or SUPABASE_SERVICE_KEY not set" },
      { status: 500 }
    );
  }

  const ref = getProjectRef(supabaseUrl);
  if (!ref) {
    return NextResponse.json(
      { error: `Cannot parse project ref from SUPABASE_URL: ${supabaseUrl}` },
      { status: 500 }
    );
  }

  // Attempt 1: Supabase Management API (requires management API token — may fail with service key)
  const mgmtUrl = `https://api.supabase.com/v1/projects/${ref}/database/query`;
  let mgmtResult: { ok: boolean; status: number; body: unknown } | null = null;

  try {
    const res = await fetch(mgmtUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: SCHEMA_SQL }),
    });
    const body = await res.json().catch(() => ({}));
    mgmtResult = { ok: res.ok, status: res.status, body };
  } catch (err) {
    mgmtResult = { ok: false, status: 0, body: String(err) };
  }

  if (mgmtResult.ok) {
    return NextResponse.json({
      success: true,
      method: "management_api",
      ref,
      result: mgmtResult.body,
      sql: SCHEMA_SQL,
    });
  }

  // Attempt 2: Try Supabase REST rpc endpoint (long shot — only works if exec_sql function exists)
  const rpcUrl = `${supabaseUrl}/rest/v1/rpc/exec_sql`;
  let rpcResult: { ok: boolean; status: number; body: unknown } | null = null;

  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql: SCHEMA_SQL }),
    });
    const body = await res.json().catch(() => ({}));
    rpcResult = { ok: res.ok, status: res.status, body };
  } catch (err) {
    rpcResult = { ok: false, status: 0, body: String(err) };
  }

  if (rpcResult.ok) {
    return NextResponse.json({
      success: true,
      method: "rpc_exec_sql",
      ref,
      result: rpcResult.body,
    });
  }

  // Both failed — return diagnostic info so the user knows exactly what to do
  return NextResponse.json(
    {
      success: false,
      ref,
      mgmt_api: mgmtResult,
      rpc_exec_sql: rpcResult,
      manual_sql: SCHEMA_SQL,
      instructions:
        "Both auto-migration attempts failed. " +
        "Please run the SQL in manual_sql field via Supabase SQL Editor at: " +
        `https://supabase.com/dashboard/project/${ref}/sql/new`,
    },
    { status: 500 }
  );
}
