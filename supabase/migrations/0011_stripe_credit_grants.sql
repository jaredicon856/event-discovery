-- Atomic, invoice-idempotent subscription grants and upgrades.

alter table credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table credit_ledger add constraint credit_ledger_reason_check check (
  reason in (
    'monthly_grant', 'topup', 'discovery_usage', 'enrichment_usage',
    'admin_adjustment', 'usage_refund', 'rollover_transfer',
    'rollover_cap_adjustment', 'upgrade_grant'
  )
);

create or replace function grant_subscription_cycle(
  p_profile_id uuid,
  p_allowance integer,
  p_period_end timestamptz,
  p_stripe_event_id text,
  p_stripe_invoice_id text,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_balance integer;
  rollover_balance integer;
  excess integer;
  grant_amount integer;
begin
  perform 1 from profiles where id = p_profile_id for update;
  if exists (
    select 1 from credit_ledger
    where stripe_invoice_id = p_stripe_invoice_id and delta > 0
  ) then return 0; end if;

  select greatest(coalesce(sum(delta), 0)::integer, 0) into subscription_balance
  from credit_ledger where profile_id = p_profile_id
    and balance_bucket = 'subscription' and (expires_at is null or expires_at > now());

  if subscription_balance > 0 then
    insert into credit_ledger(
      profile_id, delta, reason, balance_bucket, expires_at, stripe_event_id,
      stripe_invoice_id, note
    ) values
      (p_profile_id, -subscription_balance, 'rollover_transfer', 'subscription',
       p_period_end, p_stripe_event_id, null, 'Moved unused cycle credits to rollover'),
      (p_profile_id, subscription_balance, 'rollover_transfer', 'rollover',
       p_period_end, p_stripe_event_id, null, 'Moved unused cycle credits to rollover');
  end if;

  select greatest(coalesce(sum(delta), 0)::integer, 0) into rollover_balance
  from credit_ledger where profile_id = p_profile_id
    and balance_bucket = 'rollover' and (expires_at is null or expires_at > now());

  -- Leave room for the new cycle while keeping total plan credits <= 2x.
  excess := greatest(0, rollover_balance - p_allowance);
  if excess > 0 then
    insert into credit_ledger(
      profile_id, delta, reason, balance_bucket, expires_at, stripe_event_id, note
    ) values (
      p_profile_id, -excess, 'rollover_cap_adjustment', 'rollover',
      p_period_end, p_stripe_event_id, 'Applied 2x monthly rollover cap'
    );
    rollover_balance := rollover_balance - excess;
  end if;

  grant_amount := greatest(0, least(p_allowance, p_allowance * 2 - rollover_balance));
  if grant_amount > 0 then
    insert into credit_ledger(
      profile_id, delta, reason, balance_bucket, expires_at, stripe_event_id,
      stripe_invoice_id, note
    ) values (
      p_profile_id, grant_amount, 'monthly_grant', 'subscription',
      p_period_end, p_stripe_event_id, p_stripe_invoice_id, p_note
    );
  end if;
  return grant_amount;
end;
$$;

create or replace function grant_paid_upgrade(
  p_profile_id uuid,
  p_amount integer,
  p_period_end timestamptz,
  p_stripe_event_id text,
  p_stripe_invoice_id text,
  p_note text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then return 0; end if;
  perform 1 from profiles where id = p_profile_id for update;
  if exists (
    select 1 from credit_ledger
    where stripe_invoice_id = p_stripe_invoice_id and delta > 0
  ) then return 0; end if;
  insert into credit_ledger(
    profile_id, delta, reason, balance_bucket, expires_at,
    stripe_event_id, stripe_invoice_id, note
  ) values (
    p_profile_id, p_amount, 'upgrade_grant', 'subscription', p_period_end,
    p_stripe_event_id, p_stripe_invoice_id, p_note
  );
  return p_amount;
end;
$$;

revoke all on function grant_subscription_cycle(uuid,integer,timestamptz,text,text,text) from public;
revoke all on function grant_paid_upgrade(uuid,integer,timestamptz,text,text,text) from public;
grant execute on function grant_subscription_cycle(uuid,integer,timestamptz,text,text,text) to service_role;
grant execute on function grant_paid_upgrade(uuid,integer,timestamptz,text,text,text) to service_role;
