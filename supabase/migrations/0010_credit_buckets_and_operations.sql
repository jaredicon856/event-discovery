-- Retry-safe credit operations with separate subscription/rollover/manual pools.

alter table subscriptions
  add column current_period_start timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add column access_ends_at timestamptz,
  add column stripe_price_id text,
  add column pending_plan text check (pending_plan is null or pending_plan in ('starter', 'growth', 'scale'));

create table credit_operations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  operation_key text not null unique,
  action text not null check (action in ('discovery_usage', 'enrichment_usage')),
  amount integer not null check (amount > 0),
  status text not null check (status in ('charged', 'completed', 'refunded', 'insufficient')),
  debit_breakdown jsonb not null default '{}'::jsonb,
  related_event_id uuid references events(id) on delete set null,
  discovery_run_id uuid references discovery_runs(id) on delete set null,
  charged_at timestamptz,
  completed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index credit_operations_profile_created_idx
  on credit_operations (profile_id, created_at desc);
create index credit_operations_recovery_idx
  on credit_operations (status, charged_at) where status = 'charged';

alter table credit_operations enable row level security;
create policy "credit_operations: read own"
  on credit_operations for select using (auth.uid() = profile_id);

alter table credit_ledger
  add column balance_bucket text
    check (balance_bucket is null or balance_bucket in ('subscription', 'rollover', 'manual')),
  add column expires_at timestamptz,
  add column operation_id uuid references credit_operations(id) on delete set null,
  add column stripe_event_id text,
  add column stripe_invoice_id text;

-- Safe legacy assignment. Existing purchasing power is preserved; no legacy
-- row receives a retroactive expiry.
update credit_ledger
set balance_bucket = case
  when reason = 'monthly_grant' then 'subscription'
  when reason in ('topup', 'admin_adjustment') then 'manual'
  else balance_bucket
end
where balance_bucket is null;

create unique index credit_ledger_stripe_event_grant_idx
  on credit_ledger (stripe_event_id, reason)
  where stripe_event_id is not null and delta > 0;
create unique index credit_ledger_stripe_invoice_grant_idx
  on credit_ledger (stripe_invoice_id, reason)
  where stripe_invoice_id is not null and delta > 0;

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

  perform 1 from profiles where id = p_profile_id for update;
  if not found then raise exception 'Profile not found'; end if;

  select * into existing_op from credit_operations where operation_key = p_operation_key;
  if found then
    return jsonb_build_object(
      'operation_id', existing_op.id,
      'status', existing_op.status,
      'balance', (
        select coalesce(sum(delta), 0)::integer from credit_ledger
        where profile_id = p_profile_id and (expires_at is null or expires_at > now())
      ),
      'duplicate', true
    );
  end if;

  select max(current_period_end) into period_end
  from subscriptions
  where profile_id = p_profile_id
    and status in ('active', 'past_due', 'canceled');

  -- Subscription/rollover credits are unspendable after the paid period even
  -- if a late webhook has not yet written expiry rows.
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
    insert into credit_operations (
      profile_id, operation_key, action, amount, status,
      related_event_id, discovery_run_id
    ) values (
      p_profile_id, p_operation_key, p_reason, p_amount, 'insufficient',
      p_related_event_id, p_discovery_run_id
    ) returning id into op_id;
    return jsonb_build_object(
      'operation_id', op_id, 'status', 'insufficient',
      'balance', rollover_balance + subscription_balance + manual_balance,
      'duplicate', false
    );
  end if;

  insert into credit_operations (
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
    'duplicate', false, 'breakdown', breakdown
  );
end;
$$;

create or replace function complete_credit_operation(p_operation_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update credit_operations
  set status = 'completed', completed_at = now()
  where operation_key = p_operation_key and status = 'charged';
  return found;
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

  for bucket_name, bucket_amount in
    select key, value::text::integer from jsonb_each(op.debit_breakdown)
  loop
    select max(expires_at) into bucket_expiry
    from credit_ledger where operation_id = op.id and balance_bucket = bucket_name;
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

create or replace function recover_stale_credit_operations(p_older_than interval default interval '30 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  recovered integer := 0;
begin
  for item in
    select operation_key from credit_operations
    where status = 'charged' and charged_at < now() - p_older_than
    for update skip locked
  loop
    if refund_credit_operation(item.operation_key) then recovered := recovered + 1; end if;
  end loop;
  return recovered;
end;
$$;

revoke all on function debit_credits_v2(uuid,integer,text,text,uuid,uuid) from public;
revoke all on function complete_credit_operation(text) from public;
revoke all on function refund_credit_operation(text) from public;
revoke all on function recover_stale_credit_operations(interval) from public;
grant execute on function debit_credits_v2(uuid,integer,text,text,uuid,uuid) to service_role;
grant execute on function complete_credit_operation(text) to service_role;
grant execute on function refund_credit_operation(text) to service_role;
grant execute on function recover_stale_credit_operations(interval) to service_role;
