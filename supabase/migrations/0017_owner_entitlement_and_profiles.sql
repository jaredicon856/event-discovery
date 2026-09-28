-- Owner entitlement, user-editable profile details, and private avatars.

alter table profiles
  add column full_name text,
  add column display_name text,
  add column company text,
  add column job_title text,
  add column timezone text not null default 'UTC',
  add column avatar_path text,
  add column profile_updated_at timestamptz not null default now();

alter table credit_operations
  add column billing_mode text not null default 'customer_credits'
    check (billing_mode in ('customer_credits', 'owner_unbilled'));
alter table discovery_runs
  add column billing_mode text not null default 'customer_credits'
    check (billing_mode in ('customer_credits', 'owner_unbilled'));
alter table ai_usage
  add column billing_mode text not null default 'customer_credits'
    check (billing_mode in ('customer_credits', 'owner_unbilled'));

-- Direct profile writes remain closed. This RPC is the only authenticated
-- self-service mutation surface and exposes only approved personal fields.
revoke insert, update, delete on profiles from anon, authenticated;

create or replace function update_own_profile(
  p_full_name text,
  p_display_name text,
  p_company text,
  p_job_title text,
  p_timezone text,
  p_avatar_path text
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
  if p_avatar_path is not null
     and p_avatar_path !~ ('^' || auth.uid()::text || '/avatar-[a-f0-9-]+\.(jpg|png|webp)$') then
    raise exception 'Invalid avatar path';
  end if;

  update profiles
  set full_name = nullif(trim(p_full_name), ''),
      display_name = nullif(trim(p_display_name), ''),
      company = nullif(trim(p_company), ''),
      job_title = nullif(trim(p_job_title), ''),
      timezone = p_timezone,
      avatar_path = p_avatar_path,
      profile_updated_at = now()
  where id = auth.uid()
  returning * into result;
  return result;
end;
$$;

revoke all on function update_own_profile(text,text,text,text,text,text) from public, anon;
grant execute on function update_own_profile(text,text,text,text,text,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "profile photos: read own"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "profile photos: insert own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "profile photos: update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "profile photos: delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function debit_credits_v2(
  p_profile_id uuid,
  p_amount integer,
  p_reason text,
  p_operation_key text,
  p_related_event_id uuid default null,
  p_discovery_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_op credit_operations%rowtype;
  op_id uuid;
  profile_role text;
  trial_debited boolean := false;
  rollover_balance integer := 0;
  subscription_balance integer := 0;
  manual_balance integer := 0;
  remaining integer;
  take_amount integer;
  breakdown jsonb := '{}'::jsonb;
  period_end timestamptz;
begin
  if p_amount <= 0 then raise exception 'Credit debit amount must be positive'; end if;
  if p_reason not in ('discovery_usage', 'enrichment_usage') then
    raise exception 'Invalid credit debit reason';
  end if;

  select role into profile_role from profiles
  where id = p_profile_id and access_status = 'active'
  for update;
  if not found then raise exception 'Active profile not found'; end if;

  select * into existing_op from credit_operations where operation_key = p_operation_key;
  if found then
    return jsonb_build_object(
      'operation_id', existing_op.id,
      'status', existing_op.status,
      'balance', (select coalesce(sum(delta), 0)::integer from credit_ledger
        where profile_id = p_profile_id and (expires_at is null or expires_at > now())),
      'duplicate', true,
      'billing_mode', existing_op.billing_mode,
      'unbilled', existing_op.billing_mode = 'owner_unbilled'
    );
  end if;

  -- Active owners retain the same operation lifecycle and idempotency, but
  -- never touch trial counters or the customer ledger.
  if profile_role = 'super_admin' then
    insert into credit_operations(
      profile_id, operation_key, action, amount, status, debit_breakdown,
      related_event_id, discovery_run_id, charged_at, billing_mode
    ) values (
      p_profile_id, p_operation_key, p_reason, p_amount, 'charged', '{}'::jsonb,
      p_related_event_id, p_discovery_run_id, now(), 'owner_unbilled'
    ) returning id into op_id;
    return jsonb_build_object(
      'operation_id', op_id, 'status', 'charged',
      'balance', (select coalesce(sum(delta), 0)::integer from credit_ledger
        where profile_id = p_profile_id and (expires_at is null or expires_at > now())),
      'duplicate', false, 'breakdown', '{}'::jsonb,
      'billing_mode', 'owner_unbilled', 'unbilled', true
    );
  end if;

  if p_amount = 20 and p_reason = 'discovery_usage' then
    update trial_entitlements set discovery_remaining = discovery_remaining - 1
    where profile_id = p_profile_id and discovery_remaining > 0;
    trial_debited := found;
  elsif p_amount = 20 and p_reason = 'enrichment_usage' then
    update trial_entitlements set contact_lookups_remaining = contact_lookups_remaining - 1
    where profile_id = p_profile_id and contact_lookups_remaining > 0;
    trial_debited := found;
  end if;

  if trial_debited then
    insert into credit_operations(
      profile_id, operation_key, action, amount, status, debit_breakdown,
      related_event_id, discovery_run_id, charged_at
    ) values (
      p_profile_id, p_operation_key, p_reason, p_amount, 'charged',
      jsonb_build_object('trial', p_amount), p_related_event_id, p_discovery_run_id, now()
    ) returning id into op_id;
    insert into credit_ledger(
      profile_id, delta, reason, related_event_id, balance_bucket, operation_id
    ) values (
      p_profile_id, -p_amount, p_reason, p_related_event_id, 'trial', op_id
    );
    return jsonb_build_object(
      'operation_id', op_id, 'status', 'charged',
      'balance', (select coalesce(sum(delta), 0)::integer from credit_ledger
        where profile_id = p_profile_id and (expires_at is null or expires_at > now())),
      'duplicate', false, 'breakdown', jsonb_build_object('trial', p_amount),
      'billing_mode', 'customer_credits', 'unbilled', false
    );
  end if;

  select max(current_period_end) into period_end
  from subscriptions
  where profile_id = p_profile_id and status in ('active', 'past_due', 'canceled');
  if period_end is null or period_end > now() then
    select coalesce(sum(delta), 0)::integer into rollover_balance
    from credit_ledger where profile_id = p_profile_id and balance_bucket = 'rollover'
      and (expires_at is null or expires_at > now());
    select coalesce(sum(delta), 0)::integer into subscription_balance
    from credit_ledger where profile_id = p_profile_id and balance_bucket = 'subscription'
      and (expires_at is null or expires_at > now());
  end if;
  select coalesce(sum(delta), 0)::integer into manual_balance
  from credit_ledger where profile_id = p_profile_id and balance_bucket = 'manual'
    and (expires_at is null or expires_at > now());

  if rollover_balance + subscription_balance + manual_balance < p_amount then
    insert into credit_operations(
      profile_id, operation_key, action, amount, status, related_event_id, discovery_run_id
    ) values (
      p_profile_id, p_operation_key, p_reason, p_amount, 'insufficient',
      p_related_event_id, p_discovery_run_id
    ) returning id into op_id;
    return jsonb_build_object(
      'operation_id', op_id, 'status', 'insufficient',
      'balance', rollover_balance + subscription_balance + manual_balance,
      'duplicate', false, 'billing_mode', 'customer_credits', 'unbilled', false
    );
  end if;

  insert into credit_operations(
    profile_id, operation_key, action, amount, status,
    related_event_id, discovery_run_id, charged_at
  ) values (
    p_profile_id, p_operation_key, p_reason, p_amount, 'charged',
    p_related_event_id, p_discovery_run_id, now()
  ) returning id into op_id;

  remaining := p_amount;
  take_amount := least(remaining, greatest(rollover_balance, 0));
  if take_amount > 0 then
    insert into credit_ledger(profile_id, delta, reason, related_event_id, balance_bucket, expires_at, operation_id)
    values(p_profile_id, -take_amount, p_reason, p_related_event_id, 'rollover', period_end, op_id);
    breakdown := breakdown || jsonb_build_object('rollover', take_amount);
    remaining := remaining - take_amount;
  end if;
  take_amount := least(remaining, greatest(subscription_balance, 0));
  if take_amount > 0 then
    insert into credit_ledger(profile_id, delta, reason, related_event_id, balance_bucket, expires_at, operation_id)
    values(p_profile_id, -take_amount, p_reason, p_related_event_id, 'subscription', period_end, op_id);
    breakdown := breakdown || jsonb_build_object('subscription', take_amount);
    remaining := remaining - take_amount;
  end if;
  take_amount := least(remaining, greatest(manual_balance, 0));
  if take_amount > 0 then
    insert into credit_ledger(profile_id, delta, reason, related_event_id, balance_bucket, operation_id)
    values(p_profile_id, -take_amount, p_reason, p_related_event_id, 'manual', op_id);
    breakdown := breakdown || jsonb_build_object('manual', take_amount);
  end if;
  update credit_operations set debit_breakdown = breakdown where id = op_id;
  return jsonb_build_object(
    'operation_id', op_id, 'status', 'charged',
    'balance', rollover_balance + subscription_balance + manual_balance - p_amount,
    'duplicate', false, 'breakdown', breakdown,
    'billing_mode', 'customer_credits', 'unbilled', false
  );
end;
$$;

create or replace function refund_credit_operation(p_operation_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  op credit_operations%rowtype;
  bucket_name text;
  bucket_amount integer;
  bucket_expiry timestamptz;
begin
  select * into op from credit_operations where operation_key = p_operation_key for update;
  if not found or op.status = 'refunded' then return false; end if;
  if op.status <> 'charged' then return false; end if;

  if op.billing_mode = 'owner_unbilled' then
    update credit_operations set status = 'refunded', refunded_at = now() where id = op.id;
    return true;
  end if;

  for bucket_name, bucket_amount in
    select key, value::text::integer from jsonb_each(op.debit_breakdown)
  loop
    if bucket_name = 'trial' then
      if op.action = 'discovery_usage' then
        update trial_entitlements
        set discovery_remaining = least(1, discovery_remaining + 1)
        where profile_id = op.profile_id;
      else
        update trial_entitlements
        set contact_lookups_remaining = least(2, contact_lookups_remaining + 1)
        where profile_id = op.profile_id;
      end if;
      bucket_expiry := null;
    else
      select max(expires_at) into bucket_expiry
      from credit_ledger where operation_id = op.id and balance_bucket = bucket_name;
    end if;
    insert into credit_ledger(
      profile_id, delta, reason, related_event_id, balance_bucket,
      expires_at, operation_id, note
    ) values (
      op.profile_id, bucket_amount, 'usage_refund', op.related_event_id,
      bucket_name, bucket_expiry, op.id, 'Automatic refund for unfinished or failed operation'
    );
  end loop;
  update credit_operations set status = 'refunded', refunded_at = now() where id = op.id;
  return true;
end;
$$;

revoke all on function debit_credits_v2(uuid,integer,text,text,uuid,uuid) from public, anon, authenticated;
revoke all on function refund_credit_operation(text) from public, anon, authenticated;
grant execute on function debit_credits_v2(uuid,integer,text,text,uuid,uuid) to service_role;
grant execute on function refund_credit_operation(text) to service_role;
