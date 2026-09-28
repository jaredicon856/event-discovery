-- Constant-size owner metrics. The admin dashboard must not download every
-- profile or telemetry row as the customer base grows.

create or replace function get_admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'members_total', (select count(*) from profiles),
    'members_active', (select count(*) from profiles where access_status = 'active'),
    'members_suspended', (select count(*) from profiles where access_status = 'suspended'),
    'runs_total', (select count(*) from discovery_runs),
    'runs_attention', (
      select count(*) from discovery_runs where status in ('failed', 'partial')
    ),
    'ai_actions', (select count(*) from ai_usage),
    'ai_spend_usd', coalesce((select sum(estimated_cost_usd) from ai_usage), 0),
    'web_searches', coalesce((select sum(web_search_requests) from ai_usage), 0)
  );
$$;

revoke all on function get_admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function get_admin_dashboard_metrics() to service_role;
