-- Customer-owned activity around a shared events/contacts corpus.

create table discovery_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  schedule_id uuid references discovery_schedules(id) on delete set null,
  operation_key text unique,
  sector text not null,
  query text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed', 'refunded', 'insufficient_credits')),
  max_auto_contact_lookups integer not null default 7
    check (max_auto_contact_lookups between 0 and 50),
  events_found integer not null default 0,
  contact_lookups_attempted integer not null default 0,
  contacts_found integer not null default 0,
  credits_charged integer not null default 0,
  credits_refunded integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index discovery_runs_profile_created_idx
  on discovery_runs (profile_id, created_at desc);
create index discovery_runs_schedule_created_idx
  on discovery_runs (schedule_id, created_at desc);

create table discovery_run_events (
  discovery_run_id uuid not null references discovery_runs(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  result_order integer not null default 0,
  contact_lookup_status text not null default 'not_requested'
    check (contact_lookup_status in ('not_requested', 'completed', 'failed', 'refunded', 'cached', 'skipped')),
  primary key (discovery_run_id, event_id)
);

create index discovery_run_events_event_idx on discovery_run_events (event_id);

alter table discovery_schedules
  add column profile_id uuid references profiles(id) on delete cascade,
  add column max_auto_contact_lookups integer not null default 7
    check (max_auto_contact_lookups between 0 and 50);

alter table saved_lists
  add column profile_id uuid references profiles(id) on delete cascade;

create index discovery_schedules_profile_idx
  on discovery_schedules (profile_id, created_at desc);
create index saved_lists_profile_idx
  on saved_lists (profile_id, created_at desc);

-- Never execute inherited global schedules until an owner explicitly claims
-- them. Legacy lists remain unowned and are claimable by the first owner.
update discovery_schedules set enabled = false where profile_id is null;

alter table discovery_runs enable row level security;
alter table discovery_run_events enable row level security;

create policy "discovery_runs: read own"
  on discovery_runs for select using (auth.uid() = profile_id);

create policy "discovery_run_events: read own"
  on discovery_run_events for select using (
    exists (
      select 1 from discovery_runs r
      where r.id = discovery_run_id and r.profile_id = auth.uid()
    )
  );
