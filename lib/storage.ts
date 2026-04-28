import { WorkStatusPayload, StoredRun } from "./types";

// ── In-memory fallback ───────────────────────────────────────────────────────
// NOTE: Module-level state only persists within a single process.
// Works for local `npm run dev` but NOT across Vercel serverless invocations.
// Use Supabase env vars in production.
let memoryStore: StoredRun | null = null;

function saveToMemory(payload: WorkStatusPayload): StoredRun {
  const run: StoredRun = {
    ...payload,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  memoryStore = run;
  return run;
}

function getLatestFromMemory(): StoredRun | null {
  return memoryStore;
}

// ── Supabase ─────────────────────────────────────────────────────────────────
// Lazily import to avoid errors when env vars are absent
async function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key);
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function saveRun(payload: WorkStatusPayload): Promise<StoredRun> {
  const supabase = await getSupabaseClient();

  if (!supabase) {
    console.warn("[storage] SUPABASE_URL/KEY not set — using in-memory store");
    return saveToMemory(payload);
  }

  const { data, error } = await supabase
    .from("work_status_runs")
    .insert({
      date: payload.date,
      run_id: payload.run_id,
      status: payload.status,
      results: payload.results,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return data as StoredRun;
}

export async function getLatestRun(): Promise<StoredRun | null> {
  const supabase = await getSupabaseClient();

  if (!supabase) {
    return getLatestFromMemory();
  }

  const { data, error } = await supabase
    .from("work_status_runs")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return data as StoredRun | null;
}
