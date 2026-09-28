-- Public verified signup with an idempotent, action-specific free trial.

create unique index profiles_email_lower_unique_idx on profiles (lower(email));

alter table credit_ledger drop constraint if exists credit_ledger_balance_bucket_check;
alter table credit_ledger add constraint credit_ledger_balance_bucket_check check (
  balance_bucket is null or balance_bucket in ('trial', 'subscription', 'rollover', 'manual')
);
alter table credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table credit_ledger add constraint credit_ledger_reason_check check (
  reason in (
    'trial_grant', 'monthly_grant', 'topup', 'discovery_usage', 'enrichment_usage',
    'admin_adjustment', 'usage_refund', 'rollover_transfer',
    'rollover_cap_adjustment', 'upgrade_grant'
  )
);

create table trial_claims (
  normalized_email text primary key check (normalized_email = lower(trim(normalized_email))),
  profile_id uuid not null unique references profiles(id) on delete restrict,
  granted boolean not null,
  claimed_at timestamptz not null default now()
);

create table trial_entitlements (
  profile_id uuid primary key references profiles(id) on delete cascade,
  discovery_remaining integer not null default 1 check (discovery_remaining between 0 and 1),
  contact_lookups_remaining integer not null default 2 check (contact_lookups_remaining between 0 and 2),
  granted_at timestamptz not null default now()
);

-- Existing identities retain access but do not receive a retroactive trial.
insert into trial_claims(normalized_email, profile_id, granted)
select lower(email), id, false from profiles
on conflict (normalized_email) do nothing;

alter table trial_claims enable row level security;
alter table trial_entitlements enable row level security;
create policy "trial_entitlements: read own"
  on trial_entitlements for select using (
    profile_id = (select auth.uid())
    and exists (
      select 1 from profiles
      where id = (select auth.uid()) and access_status = 'active'
    )
  );

create table customer_event_contacts (
  profile_id uuid not null references profiles(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  discovery_run_id uuid references discovery_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, event_id, contact_id)
);
create index customer_event_contacts_run_idx
  on customer_event_contacts(discovery_run_id, event_id);
alter table customer_event_contacts enable row level security;
create policy "customer_event_contacts: read own"
  on customer_event_contacts for select using (
    profile_id = (select auth.uid())
    and exists (
      select 1 from profiles
      where id = (select auth.uid()) and access_status = 'active'
    )
  );

create or replace function activate_public_account(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  verified_email text;
  profile_state text;
  claimed_profile_id uuid;
  trial_granted boolean := false;
begin
  select lower(email) into verified_email
  from auth.users
  where id = p_profile_id and email_confirmed_at is not null;
  if verified_email is null then
    return jsonb_build_object('activated', false, 'trial_granted', false, 'reason', 'unverified');
  end if;

  select access_status into profile_state from profiles where id = p_profile_id for update;
  if profile_state = 'suspended' then
    return jsonb_build_object('activated', false, 'trial_granted', false, 'reason', 'suspended');
  end if;

  update profiles
  set access_status = 'active', disabled = false, activated_at = coalesce(activated_at, now())
  where id = p_profile_id;

  insert into trial_claims(normalized_email, profile_id, granted)
  values(verified_email, p_profile_id, true)
  on conflict (normalized_email) do nothing
  returning profile_id into claimed_profile_id;

  if claimed_profile_id = p_profile_id then
    insert into trial_entitlements(profile_id) values(p_profile_id)
    on conflict (profile_id) do nothing;
    insert into credit_ledger(
      profile_id, delta, reason, balance_bucket, note
    ) values (
      p_profile_id, 60, 'trial_grant', 'trial',
      'Free trial: one discovery search and up to two contact lookups'
    );
    trial_granted := true;
  end if;

  return jsonb_build_object('activated', true, 'trial_granted', trial_granted);
end;
$$;

revoke all on function activate_public_account(uuid) from public, anon, authenticated;
grant execute on function activate_public_account(uuid) to service_role;

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
  perform 1 from profiles
  where id = p_profile_id and access_status = 'active'
  for update;
  if not found then raise exception 'Active profile not found'; end if;

  select * into existing_op from credit_operations where operation_key = p_operation_key;
  if found then
    return jsonb_build_object(
      'operation_id', existing_op.id, 'status', existing_op.status,
      'balance', (select coalesce(sum(delta), 0)::integer from credit_ledger
        where profile_id = p_profile_id and (expires_at is null or expires_at > now())),
      'duplicate', true
    );
  end if;

  -- Trial actions are counters, not fungible credits: exactly one discovery
  -- and at most two contact lookups. A retry with the same key is idempotent.
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
      'duplicate', false, 'breakdown', jsonb_build_object('trial', p_amount)
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
      'duplicate', false
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
    'duplicate', false, 'breakdown', breakdown
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
