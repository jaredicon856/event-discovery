-- Per-action Anthropic usage and estimated direct COGS. This is the evidence
-- used to validate the 70% pricing guardrail against real production runs.

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  action text not null check (action in ('discovery', 'enrichment')),
  related_event_id uuid references events(id) on delete set null,
  discovery_run_id uuid,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_creation_input_tokens integer not null default 0,
  cache_read_input_tokens integer not null default 0,
  web_search_requests integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  credits_charged integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_created_at_idx on ai_usage (created_at desc);
create index ai_usage_profile_id_idx on ai_usage (profile_id, created_at desc);
create index ai_usage_discovery_run_id_idx on ai_usage (discovery_run_id);

alter table ai_usage enable row level security;

create policy "ai_usage: read own"
  on ai_usage for select
  using (auth.uid() = profile_id);
