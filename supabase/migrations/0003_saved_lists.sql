-- Named filter presets ("smart lists") over the events table.
create table saved_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text,
  tier text,
  status text,
  from_date date,
  to_date date,
  q text,
  created_at timestamptz not null default now()
);
