-- Speaker Island members' monthly allowance is one pool: each action, a search
-- or a contact lookup, takes one from discovery_remaining. Before this a
-- member with 180 credits showing was told "Need 20 credits (have 0)" when
-- looking up a contact, because lookups drew on a separate counter set to 0.
-- The public trial keeps its separate counts (1 search, 2 lookups).

create or replace function debit_credits_v2(p_profile_id uuid, p_amount integer, p_reason text, p_operation_key text, p_related_event_id uuid default null, p_discovery_run_id uuid default null)
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
  trial_expiry timestamptz;
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
    where profile_id = p_profile_id and discovery_remaining > 0 and expires_at > now()
    returning expires_at into trial_expiry;
    trial_debited := found;
  elsif p_amount = 20 and p_reason = 'enrichment_usage' then
    -- Public trial: its own lookup count. Speaker Island: the shared pool.
    update trial_entitlements set contact_lookups_remaining = contact_lookups_remaining - 1
    where profile_id = p_profile_id and source <> 'speaker_island'
      and contact_lookups_remaining > 0 and expires_at > now()
    returning expires_at into trial_expiry;
    trial_debited := found;
    if not trial_debited then
      update trial_entitlements set discovery_remaining = discovery_remaining - 1
      where profile_id = p_profile_id and source = 'speaker_island'
        and discovery_remaining > 0 and expires_at > now()
      returning expires_at into trial_expiry;
      trial_debited := found;
    end if;
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
      profile_id, delta, reason, related_event_id, balance_bucket, expires_at, operation_id
    ) values (
      p_profile_id, -p_amount, p_reason, p_related_event_id, 'trial', trial_expiry, op_id
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

-- A refunded action goes back where it came from: for a Speaker Island member,
-- either kind of action returns to the shared pool.
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
  is_monthly boolean;
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
      select source = 'speaker_island' into is_monthly
      from trial_entitlements where profile_id = op.profile_id;
      if is_monthly then
        update trial_entitlements
        set discovery_remaining = least(100, discovery_remaining + 1)
        where profile_id = op.profile_id;
      elsif op.action = 'discovery_usage' then
        update trial_entitlements
        set discovery_remaining = least(1, discovery_remaining + 1)
        where profile_id = op.profile_id;
      else
        update trial_entitlements
        set contact_lookups_remaining = least(2, contact_lookups_remaining + 1)
        where profile_id = op.profile_id;
      end if;
      select expires_at into bucket_expiry
      from trial_entitlements where profile_id = op.profile_id;
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
