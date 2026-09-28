-- Keep fixtures and paid evaluation evidence distinct from customer activity.
-- Nothing is deleted: existing evaluation runs are classified in place.

alter table profiles
  add column if not exists is_test_account boolean not null default false;

alter table discovery_runs
  add column if not exists run_kind text not null default 'customer'
  check (run_kind in ('customer', 'evaluation', 'fixture'));

alter table ai_usage
  add column if not exists usage_kind text not null default 'customer'
  check (usage_kind in ('customer', 'evaluation', 'fixture'));

update profiles
set is_test_account = true
where email ilike '%@example.com'
   or email ilike 'event-scout-test-%'
   or email ilike 'ui-regression-%';

update discovery_runs
set run_kind = case
  when operation_key like 'eval:%' then 'evaluation'
  when operation_key like 'test:%'
    or operation_key like 'fixture:%'
    or query ilike '% fixture%' then 'fixture'
  else run_kind
end
where operation_key like 'eval:%'
   or operation_key like 'test:%'
   or operation_key like 'fixture:%'
   or query ilike '% fixture%';

create or replace function classify_profile_test_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email ilike '%@example.com'
    or new.email ilike 'event-scout-test-%'
    or new.email ilike 'ui-regression-%' then
    new.is_test_account := true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_classify_test_account on profiles;
create trigger profiles_classify_test_account
before insert or update of email on profiles
for each row execute function classify_profile_test_account();

create or replace function classify_discovery_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operation_key like 'eval:%' then
    new.run_kind := 'evaluation';
  elsif new.operation_key like 'test:%'
    or new.operation_key like 'fixture:%'
    or new.query ilike '% fixture%' then
    new.run_kind := 'fixture';
  elsif exists (
    select 1 from profiles
    where id = new.profile_id and is_test_account
  ) then
    new.run_kind := 'fixture';
  end if;
  return new;
end;
$$;

drop trigger if exists discovery_runs_classify_kind on discovery_runs;
create trigger discovery_runs_classify_kind
before insert or update of operation_key, query, profile_id on discovery_runs
for each row execute function classify_discovery_run();

update ai_usage usage
set usage_kind = coalesce(
  (select run_kind from discovery_runs where id = usage.discovery_run_id),
  case
    when exists (
      select 1 from profiles
      where id = usage.profile_id and is_test_account
    ) then 'fixture'
    else 'customer'
  end
);

create or replace function classify_ai_usage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  classified_kind text;
begin
  if new.discovery_run_id is not null then
    select run_kind into classified_kind
    from discovery_runs
    where id = new.discovery_run_id;
    new.usage_kind := coalesce(classified_kind, new.usage_kind);
  elsif new.profile_id is not null and exists (
    select 1 from profiles
    where id = new.profile_id and is_test_account
  ) then
    new.usage_kind := 'fixture';
  end if;
  new.usage_kind := coalesce(new.usage_kind, 'customer');
  return new;
end;
$$;

drop trigger if exists ai_usage_classify_kind on ai_usage;
create trigger ai_usage_classify_kind
before insert or update of discovery_run_id, profile_id on ai_usage
for each row execute function classify_ai_usage();

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
    'web_searches', coalesce((
      select sum(web_search_requests) from ai_usage where usage_kind = 'customer'
    ), 0)
  );
$$;

revoke all on function get_admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function get_admin_dashboard_metrics() to service_role;
