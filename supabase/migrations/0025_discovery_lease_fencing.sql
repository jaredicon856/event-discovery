-- Fence discovery workers with a per-claim token. A worker whose lease has
-- expired can no longer renew or complete a job after another worker claims it.

alter table discovery_jobs
  add column if not exists lease_token uuid;

create or replace function claim_discovery_job(p_limit integer default 1)
returns setof discovery_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update discovery_jobs
  set status = 'failed',
      last_error = 'retry_exhausted',
      lease_token = null,
      lease_expires_at = null,
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
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '90 seconds',
      heartbeat_at = now(),
      updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function claim_discovery_job_for_run(p_run_id uuid)
returns discovery_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed discovery_jobs%rowtype;
begin
  update discovery_jobs
  set status = 'failed',
      last_error = 'retry_exhausted',
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where run_id = p_run_id
    and status in ('queued', 'running')
    and attempt_count >= 3
    and (status = 'queued' or lease_expires_at is null or lease_expires_at < now());

  update discovery_jobs
  set status = 'running',
      attempt_count = attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '90 seconds',
      heartbeat_at = now(),
      updated_at = now()
  where run_id = p_run_id
    and status in ('queued', 'running')
    and attempt_count < 3
    and (
      status = 'queued'
      or lease_expires_at is null
      or lease_expires_at < now()
    )
  returning * into claimed;

  return claimed;
end;
$$;

drop function if exists heartbeat_discovery_job(uuid);
create function heartbeat_discovery_job(p_run_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  touched integer;
begin
  update discovery_jobs
  set heartbeat_at = now(),
      lease_expires_at = now() + interval '90 seconds',
      updated_at = now()
  where run_id = p_run_id
    and status = 'running'
    and lease_token = p_lease_token;
  get diagnostics touched = row_count;
  return touched = 1;
end;
$$;

revoke all on function claim_discovery_job(integer) from public, anon, authenticated;
revoke all on function claim_discovery_job_for_run(uuid) from public, anon, authenticated;
revoke all on function heartbeat_discovery_job(uuid, uuid) from public, anon, authenticated;
grant execute on function claim_discovery_job(integer) to service_role;
grant execute on function claim_discovery_job_for_run(uuid) to service_role;
grant execute on function heartbeat_discovery_job(uuid, uuid) to service_role;
