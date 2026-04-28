create table work_status_runs (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  run_id      text not null unique,
  status      text not null,
  results     jsonb not null,
  created_at  timestamptz default now()
);

create index on work_status_runs (date desc);
create index on work_status_runs (created_at desc);
