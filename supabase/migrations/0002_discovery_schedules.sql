-- Saved sector/query searches that a cron job can re-run automatically.
create table discovery_schedules (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  query text not null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_run_summary text,
  created_at timestamptz not null default now()
);

create index discovery_schedules_enabled_idx on discovery_schedules (enabled);
