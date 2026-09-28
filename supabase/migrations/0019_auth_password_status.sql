create or replace function auth_password_enabled(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce(length(encrypted_password) > 0, false)
  from auth.users
  where id = p_profile_id;
$$;

revoke all on function auth_password_enabled(uuid) from public, anon, authenticated;
grant execute on function auth_password_enabled(uuid) to service_role;
