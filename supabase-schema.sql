-- ── work_status_runs ─────────────────────────────────────────────────────────
-- Supabase SQL Editor에서 실행하세요.
-- 기존 테이블이 있어도 충돌 없이 동작합니다 (IF NOT EXISTS).

create table if not exists public.work_status_runs (
  id          uuid        primary key default gen_random_uuid(),
  date        text        not null,
  run_id      text        not null unique,
  status      text        not null,
  results     jsonb       not null,
  created_at  timestamptz not null default now()
);

-- 인덱스 (중복 생성 방지)
create index if not exists work_status_runs_created_at_idx on public.work_status_runs (created_at desc);
create index if not exists work_status_runs_run_id_idx      on public.work_status_runs (run_id);

-- Row Level Security (서비스 키는 RLS bypass, anon은 차단)
alter table public.work_status_runs enable row level security;
