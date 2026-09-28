-- The immediate after() worker and recovery cron must share the same lease
-- protocol. Claiming by run id prevents the after() path from processing a
-- still-queued job concurrently with the cron claimer.

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
      lease_expires_at = null,
      updated_at = now()
  where run_id = p_run_id
    and status in ('queued', 'running')
    and attempt_count >= 3
    and (status = 'queued' or lease_expires_at is null or lease_expires_at < now());

  update discovery_jobs
  set status = 'running',
      attempt_count = attempt_count + 1,
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

revoke all on function claim_discovery_job_for_run(uuid)
  from public, anon, authenticated;
grant execute on function claim_discovery_job_for_run(uuid) to service_role;
