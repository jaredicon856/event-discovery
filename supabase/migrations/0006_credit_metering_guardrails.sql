-- Credit model v2: 20 displayed credits per AI action, atomic debits,
-- usage refunds, rollover caps, and Stripe webhook idempotency.

alter table credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table credit_ledger add constraint credit_ledger_reason_check check (
  reason in (
    'monthly_grant',
    'topup',
    'discovery_usage',
    'enrichment_usage',
    'usage_refund',
    'admin_adjustment'
  )
);

-- Existing balances used the original 1-credit-per-action scale. Multiplying
-- preserves purchasing power when actions move to 20 displayed credits.
update credit_ledger set delta = delta * 20;
update subscriptions set credits_per_cycle = credits_per_cycle * 20
where credits_per_cycle in (60, 150, 400);

-- Serialize debits per profile so two simultaneous requests cannot both spend
-- the same balance. Returns the post-debit balance, or -1 when unaffordable.
create or replace function debit_credits(
  p_profile_id uuid,
  p_amount integer,
  p_reason text,
  p_related_event_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'Credit debit amount must be positive';
  end if;
  if p_reason not in ('discovery_usage', 'enrichment_usage') then
    raise exception 'Invalid credit debit reason';
  end if;

  perform 1 from profiles where id = p_profile_id for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  select coalesce(sum(delta), 0)::integer
    into current_balance
    from credit_ledger
    where profile_id = p_profile_id;

  if current_balance < p_amount then
    return -1;
  end if;

  insert into credit_ledger (profile_id, delta, reason, related_event_id)
  values (p_profile_id, -p_amount, p_reason, p_related_event_id);

  return current_balance - p_amount;
end;
$$;

revoke all on function debit_credits(uuid, integer, text, uuid) from public;
grant execute on function debit_credits(uuid, integer, text, uuid) to service_role;

-- Stripe may deliver the same event more than once. This table makes credit
-- grants idempotent; failed handlers delete their claim so Stripe can retry.
create table stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table stripe_webhook_events enable row level security;
