-- Event Scout accounts always use US Eastern Time.
-- America/New_York follows EST in winter and EDT in summer.

alter table profiles
  alter column timezone set default 'America/New_York';

update profiles
set timezone = 'America/New_York'
where timezone is distinct from 'America/New_York';

create or replace function profiles_force_eastern_timezone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.timezone := 'America/New_York';
  return new;
end;
$$;

drop trigger if exists profiles_force_eastern_timezone on profiles;
create trigger profiles_force_eastern_timezone
before insert or update of timezone on profiles
for each row execute function profiles_force_eastern_timezone();

create or replace function update_own_profile(
  p_full_name text,
  p_display_name text,
  p_company text,
  p_job_title text,
  p_timezone text
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from profiles
    where id = auth.uid() and access_status = 'active'
  ) then raise exception 'Active profile required'; end if;
  if length(coalesce(p_full_name, '')) > 120
     or length(coalesce(p_display_name, '')) > 80
     or length(coalesce(p_company, '')) > 120
     or length(coalesce(p_job_title, '')) > 120 then
    raise exception 'Profile field is too long';
  end if;
  if p_timezone is not null
     and not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone';
  end if;

  update profiles
  set full_name = nullif(trim(p_full_name), ''),
      display_name = nullif(trim(p_display_name), ''),
      company = nullif(trim(p_company), ''),
      job_title = nullif(trim(p_job_title), ''),
      timezone = 'America/New_York',
      profile_updated_at = now()
  where id = auth.uid()
  returning * into result;
  return result;
end;
$$;

revoke all on function update_own_profile(text,text,text,text,text) from public, anon;
grant execute on function update_own_profile(text,text,text,text,text) to authenticated;
