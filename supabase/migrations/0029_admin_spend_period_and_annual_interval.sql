-- Admin dashboard: lifetime + calendar-month AI spend, and annual billing interval.

alter table subscriptions
  add column if not exists billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year'));

create or replace function get_admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'members_total', (
      select count(*) from profiles where not is_test_account
    ),
    'members_active', (
      select count(*) from profiles
      where not is_test_account and access_status = 'active'
    ),
    'members_suspended', (
      select count(*) from profiles
      where not is_test_account and access_status = 'suspended'
    ),
    'runs_total', (
      select count(*) from discovery_runs run
      where run.run_kind = 'customer'
        and exists (
          select 1 from profiles profile
          where profile.id = run.profile_id and not profile.is_test_account
        )
    ),
    'runs_attention', (
      select count(*) from discovery_runs run
      where run.run_kind = 'customer'
        and run.status in ('failed', 'partial')
        and exists (
          select 1 from profiles profile
          where profile.id = run.profile_id and not profile.is_test_account
        )
    ),
    'ai_actions', (
      select count(*) from ai_usage where usage_kind = 'customer'
    ),
    'ai_spend_usd', coalesce((
      select sum(estimated_cost_usd) from ai_usage where usage_kind = 'customer'
    ), 0),
    'ai_actions_month', (
      select count(*) from ai_usage
      where usage_kind = 'customer'
        and created_at >= date_trunc('month', timezone('utc', now()))
    ),
    'ai_spend_usd_month', coalesce((
      select sum(estimated_cost_usd) from ai_usage
      where usage_kind = 'customer'
        and created_at >= date_trunc('month', timezone('utc', now()))
    ), 0),
    'web_searches', coalesce((
      select sum(web_search_requests) from ai_usage where usage_kind = 'customer'
    ), 0)
  );
$$;

revoke all on function get_admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function get_admin_dashboard_metrics() to service_role;
