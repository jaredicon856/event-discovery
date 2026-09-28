-- Contact-enrichment spend was recorded in ai_usage (global telemetry) but
-- never rolled into discovery_runs.estimated_cost_usd, so a run's own cost
-- field undercounted real spend whenever contacts were also researched
-- (observed: $0.17 tracked vs $0.76 real for one run). Per-customer
-- margin-risk flags already sum ai_usage and were fine; this fixes the
-- per-run cost column used by run detail / run-level displays.
--
-- Concurrent contact lookups run in parallel batches, so this must be an
-- atomic increment (not a client-side read-modify-write, which would lose
-- updates under concurrency).
create or replace function increment_discovery_run_cost(p_run_id uuid, p_amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update discovery_runs
  set estimated_cost_usd = estimated_cost_usd + p_amount
  where id = p_run_id;
$$;

revoke all on function increment_discovery_run_cost(uuid, numeric) from public, anon, authenticated;
grant execute on function increment_discovery_run_cost(uuid, numeric) to service_role;
