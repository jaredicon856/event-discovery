drop policy if exists "profile photos: insert own" on storage.objects;
drop policy if exists "profile photos: update own" on storage.objects;
drop policy if exists "profile photos: delete own" on storage.objects;

drop function if exists update_own_profile(text,text,text,text,text,text);

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
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone';
  end if;

  update profiles
  set full_name = nullif(trim(p_full_name), ''),
      display_name = nullif(trim(p_display_name), ''),
      company = nullif(trim(p_company), ''),
      job_title = nullif(trim(p_job_title), ''),
      timezone = p_timezone,
      profile_updated_at = now()
  where id = auth.uid()
  returning * into result;
  return result;
end;
$$;

revoke all on function update_own_profile(text,text,text,text,text) from public, anon;
grant execute on function update_own_profile(text,text,text,text,text) to authenticated;
