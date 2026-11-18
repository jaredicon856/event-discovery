-- A refund puts a search or contact lookup back on the counter. The caps of 1
-- and 2 are the public trial's allowance; for a Speaker Island member they
-- wiped the rest of the month (10 searches, one failed search, back to 1).
-- Speaker Island counters cap at the table's limits instead (100 and 200).

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
      if op.action = 'discovery_usage' then
        update trial_entitlements
        set discovery_remaining = least(case when is_monthly then 100 else 1 end, discovery_remaining + 1)
        where profile_id = op.profile_id;
      else
        update trial_entitlements
        set contact_lookups_remaining = least(case when is_monthly then 200 else 2 end, contact_lookups_remaining + 1)
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

-- Repair: members whose counter a refund cut below what their ledger holds.
-- Each search is 20 credits; the counter goes back to the unexpired trial
-- balance this month, never above the monthly grant.
update trial_entitlements t
set discovery_remaining = least(100, fixed.searches)
from (
  select l.profile_id, (sum(l.delta) / 20)::integer as searches
  from credit_ledger l
  join speaker_island_members m on m.profile_id = l.profile_id
  where l.balance_bucket = 'trial' and l.expires_at > now()
    and l.reason in ('trial_grant', 'discovery_usage', 'usage_refund')
  group by l.profile_id
) fixed
where t.profile_id = fixed.profile_id
  and t.source = 'speaker_island'
  and t.discovery_remaining < fixed.searches;
