-- Durable discovery jobs, staged artifacts, outcome classes, and atomic enqueue.

alter table discovery_runs
  drop constraint if exists discovery_runs_status_check;

alter table discovery_runs
  add column if not exists current_stage text not null default 'queued',
  add column if not exists last_completed_stage text,
  add column if not exists failure_class text,
  add column if not exists criteria jsonb not null default '{}'::jsonb,
  add column if not exists stage_summaries jsonb not null default '[]'::jsonb,
  add column if not exists citations jsonb not null default '[]'::jsonb,
  add column if not exists estimated_cost_usd numeric(12, 6) not null default 0,
  add column if not exists budget_overrun boolean not null default false,
  add column if not exists extraction_truncated boolean not null default false,
  add column if not exists candidate_count integer not null default 0,
  add column if not exists verified_exact_count integer not null default 0,
  add column if not exists related_count integer not null default 0,
  add column if not exists displayed_credit_cap integer;

alter table discovery_runs
  add constraint discovery_runs_status_check
  check (status in (
    'queued', 'running', 'completed', 'partial', 'no_matches',
    'failed', 'refunded', 'insufficient_credits'
  ));

alter table discovery_runs
  add constraint discovery_runs_current_stage_check
  check (current_stage in (
    'queued', 'research', 'fallback_research', 'extraction',
    'validation', 'persist', 'enrichment', 'done'
  ));

alter table discovery_run_events
  add column if not exists match_kind text not null default 'exact'
    check (match_kind in ('exact', 'related')),
  add column if not exists mismatch_reasons text[] not null default '{}';

create table if not exists discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references discovery_runs(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempt_count integer not null default 0,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_completed_stage text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists discovery_jobs_claim_idx
  on discovery_jobs (status, lease_expires_at, created_at);

create table if not exists discovery_run_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references discovery_runs(id) on delete cascade,
  stage text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, stage)
);

alter table ai_usage drop constraint if exists ai_usage_action_check;
alter table ai_usage
  add constraint ai_usage_action_check
  check (action in (
    'discovery', 'enrichment', 'research', 'fallback_research', 'extraction'
  ));

alter table discovery_jobs enable row level security;
alter table discovery_run_artifacts enable row level security;

-- Atomic: insert run, debit, enqueue job. Nothing is charged without a job.
create or replace function enqueue_discovery_run(
  p_profile_id uuid,
  p_sector text,
  p_query text,
  p_operation_key text,
  p_max_auto_contact_lookups integer,
  p_criteria jsonb default '{}'::jsonb,
  p_displayed_credit_cap integer default null,
  p_schedule_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing discovery_runs%rowtype;
  run_id uuid := gen_random_uuid();
  debit jsonb;
  billing text;
  profile_role text;
begin
  if p_sector is null or length(trim(p_sector)) = 0 or p_query is null or length(trim(p_query)) = 0 then
    raise exception 'sector and query are required';
  end if;
  if p_max_auto_contact_lookups < 0 or p_max_auto_contact_lookups > 10 then
    raise exception 'max_auto_contact_lookups must be 0 to 10';
  end if;

  select * into existing from discovery_runs where operation_key = p_operation_key;
  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'run_id', existing.id,
      'billing_mode', existing.billing_mode
    );
  end if;

  select role into profile_role from profiles
  where id = p_profile_id and access_status = 'active' for update;
  if not found then raise exception 'Active profile not found'; end if;
  billing := case when profile_role = 'super_admin' then 'owner_unbilled' else 'customer_credits' end;

  insert into discovery_runs (
    id, profile_id, schedule_id, operation_key, sector, query, status,
    max_auto_contact_lookups, billing_mode, current_stage, criteria, displayed_credit_cap
  ) values (
    run_id, p_profile_id, p_schedule_id, p_operation_key, p_sector, p_query, 'queued',
    p_max_auto_contact_lookups, billing, 'queued', coalesce(p_criteria, '{}'::jsonb),
    p_displayed_credit_cap
  );

  debit := debit_credits_v2(
    p_profile_id,
    20,
    'discovery_usage',
    p_operation_key || ':discovery',
    null,
    run_id
  );

  if debit->>'status' = 'insufficient' then
    delete from discovery_runs where id = run_id;
    return jsonb_build_object(
      'status', 'insufficient',
      'balance', (debit->>'balance')::integer,
      'required', 20
    );
  end if;

  if debit->>'status' not in ('charged', 'completed') then
    delete from discovery_runs where id = run_id;
    raise exception 'Credit operation is %', coalesce(debit->>'status', 'invalid');
  end if;

  insert into discovery_jobs (run_id, status) values (run_id, 'queued');

  return jsonb_build_object(
    'status', 'queued',
    'run_id', run_id,
    'billing_mode', billing,
    'duplicate', coalesce((debit->>'duplicate')::boolean, false)
  );
end;
$$;

create or replace function claim_discovery_job(p_limit integer default 1)
returns setof discovery_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Terminal-fail jobs that already used 3 lease claims.
  update discovery_jobs
  set status = 'failed',
      last_error = 'retry_exhausted',
      updated_at = now()
  where status in ('queued', 'running')
    and attempt_count >= 3
    and (status = 'queued' or lease_expires_at is null or lease_expires_at < now());

  return query
  with picked as (
    select id from discovery_jobs
    where status in ('queued', 'running')
      and attempt_count < 3
      and (
        status = 'queued'
        or lease_expires_at is null
        or lease_expires_at < now()
      )
    order by created_at
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update discovery_jobs j
  set status = 'running',
      attempt_count = j.attempt_count + 1,
      lease_expires_at = now() + interval '90 seconds',
      heartbeat_at = now(),
      updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function heartbeat_discovery_job(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update discovery_jobs
  set heartbeat_at = now(),
      lease_expires_at = now() + interval '90 seconds',
      updated_at = now()
  where run_id = p_run_id and status = 'running';
end;
$$;

revoke all on function enqueue_discovery_run(uuid, text, text, text, integer, jsonb, integer, uuid)
  from public, anon, authenticated;
revoke all on function claim_discovery_job(integer) from public, anon, authenticated;
revoke all on function heartbeat_discovery_job(uuid) from public, anon, authenticated;
grant execute on function enqueue_discovery_run(uuid, text, text, text, integer, jsonb, integer, uuid) to service_role;
grant execute on function claim_discovery_job(integer) to service_role;
grant execute on function heartbeat_discovery_job(uuid) to service_role;
