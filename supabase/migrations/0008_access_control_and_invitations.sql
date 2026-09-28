-- Invitation-only access, owner bootstrap, and immutable admin audit history.

alter table profiles
  add column access_status text not null default 'pending'
    check (access_status in ('pending', 'active', 'suspended')),
  add column invited_at timestamptz,
  add column activated_at timestamptz,
  add column invited_by uuid references profiles(id) on delete set null;

-- Preserve access for accounts that existed before invitation gating.
update profiles
set access_status = case when disabled then 'suspended' else 'active' end,
    activated_at = case when disabled then null else coalesce(activated_at, created_at) end;

create table invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email))),
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_profile_id uuid references profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index invitations_one_pending_email_idx
  on invitations (email) where status = 'pending';
create index invitations_created_at_idx on invitations (created_at desc);

create table access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email))),
  name text,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index access_requests_one_pending_email_idx
  on access_requests (email) where status = 'pending';

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id) on delete set null,
  target_profile_id uuid references profiles(id) on delete set null,
  action text not null,
  reason text not null check (length(trim(reason)) >= 3),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_at_idx on admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on admin_audit_log (target_profile_id, created_at desc);

alter table invitations enable row level security;
alter table access_requests enable row level security;
alter table admin_audit_log enable row level security;

-- AI provider costs and margin inputs are internal-only. Customers receive
-- sanitized usage summaries from authenticated server APIs instead.
drop policy if exists "ai_usage: read own" on ai_usage;

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, access_status)
  values (new.id, lower(new.email), 'pending');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function accept_invitation(
  p_profile_id uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_email text;
  is_verified boolean;
  invite_row invitations%rowtype;
begin
  select lower(email), email_confirmed_at is not null
    into auth_email, is_verified
    from auth.users
    where id = p_profile_id;

  if auth_email is null or not is_verified then
    return false;
  end if;

  select *
    into invite_row
    from invitations
    where token_hash = p_token_hash
    for update;

  if not found
     or invite_row.status <> 'pending'
     or invite_row.expires_at <= now()
     or invite_row.email <> auth_email then
    if found and invite_row.status = 'pending' and invite_row.expires_at <= now() then
      update invitations set status = 'expired' where id = invite_row.id;
    end if;
    return false;
  end if;

  update invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_profile_id = p_profile_id
  where id = invite_row.id;

  update profiles
  set access_status = 'active',
      disabled = false,
      invited_at = invite_row.created_at,
      invited_by = invite_row.invited_by,
      activated_at = coalesce(activated_at, now())
  where id = p_profile_id;

  return true;
end;
$$;

revoke all on function accept_invitation(uuid, text) from public;
grant execute on function accept_invitation(uuid, text) to service_role;

-- Trusted, one-time bootstrap: requires service role, a verified auth identity,
-- an accepted invitation, and no existing active super-admin.
create or replace function bootstrap_first_super_admin(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if exists (
    select 1 from profiles
    where role = 'super_admin' and access_status = 'active'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from profiles p
    join auth.users u on u.id = p.id
    join invitations i on i.accepted_profile_id = p.id and i.status = 'accepted'
    where p.id = p_profile_id
      and p.access_status = 'active'
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(p.email)
  ) then
    return false;
  end if;

  update profiles set role = 'super_admin' where id = p_profile_id;
  insert into admin_audit_log (
    actor_profile_id, target_profile_id, action, reason, details
  ) values (
    p_profile_id, p_profile_id, 'bootstrap_super_admin',
    'Initial verified owner bootstrap', jsonb_build_object('trusted_setup', true)
  );
  return true;
end;
$$;

revoke all on function bootstrap_first_super_admin(uuid) from public;
grant execute on function bootstrap_first_super_admin(uuid) to service_role;

create or replace function protect_last_super_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.role = 'super_admin' and old.access_status = 'active'
     and (
       tg_op = 'DELETE'
       or (tg_op = 'UPDATE' and (new.role <> 'super_admin' or new.access_status <> 'active'))
     ) then
    if not exists (
      select 1 from profiles
      where id <> old.id and role = 'super_admin' and access_status = 'active'
    ) then
      raise exception 'Cannot remove or suspend the last active super-admin';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_last_super_admin_update
  before update of role, access_status on profiles
  for each row execute function protect_last_super_admin();

create trigger profiles_protect_last_super_admin_delete
  before delete on profiles
  for each row execute function protect_last_super_admin();

create or replace function keep_admin_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Admin audit history is immutable';
end;
$$;

create trigger admin_audit_no_update
  before update or delete on admin_audit_log
  for each row execute function keep_admin_audit_immutable();
