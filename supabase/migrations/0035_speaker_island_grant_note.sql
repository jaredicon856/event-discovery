-- Speaker Island grant note leaves out contact lookups when there are none.

create or replace function grant_speaker_island_month(p_profile_id uuid, p_searches integer, p_lookups integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  this_month date := date_trunc('month', now() at time zone 'America/New_York')::date;
  month_end timestamptz := ((this_month + interval '1 month')::timestamp at time zone 'America/New_York');
  member speaker_island_members%rowtype;
begin
  if p_searches < 0 or p_searches > 100 or p_lookups < 0 or p_lookups > 200 then
    raise exception 'Allowance out of range';
  end if;
  select * into member from speaker_island_members where profile_id = p_profile_id for update;
  if not found then raise exception 'Not a Speaker Island member'; end if;
  if member.last_grant_month = this_month then return false; end if;

  -- Retire whatever trial balance is left (grants and their debits together),
  -- so the shown balance is exactly this month's allowance.
  update credit_ledger set expires_at = now()
  where profile_id = p_profile_id and balance_bucket = 'trial'
    and (expires_at is null or expires_at > now());

  insert into trial_entitlements(profile_id, discovery_remaining, contact_lookups_remaining, expires_at, source,
    ending_reminder_sent_at, expired_notice_sent_at)
  values (p_profile_id, p_searches, p_lookups, month_end, 'speaker_island', now(), now())
  on conflict (profile_id) do update set
    discovery_remaining = excluded.discovery_remaining,
    contact_lookups_remaining = excluded.contact_lookups_remaining,
    expires_at = excluded.expires_at,
    source = 'speaker_island',
    -- Trial reminder emails don't apply to the monthly allowance.
    ending_reminder_sent_at = now(),
    expired_notice_sent_at = now();

  insert into credit_ledger(profile_id, delta, reason, balance_bucket, expires_at, note)
  values (
    p_profile_id, (p_searches + p_lookups) * 20, 'trial_grant', 'trial', month_end,
    case when p_lookups > 0
      then format('Speaker Island: %s searches and %s contact lookups for %s', p_searches, p_lookups, to_char(this_month, 'FMMonth YYYY'))
      else format('Speaker Island: %s searches for %s', p_searches, to_char(this_month, 'FMMonth YYYY'))
    end
  );

  update speaker_island_members set last_grant_month = this_month where profile_id = p_profile_id;
  return true;
end;
$$;


revoke all on function grant_speaker_island_month(uuid, integer, integer) from public, anon, authenticated;
grant execute on function grant_speaker_island_month(uuid, integer, integer) to service_role;
