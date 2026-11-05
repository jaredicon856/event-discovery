-- Speaker Island members (cast and community) sign in from the Speaker Island
-- Portal and get a monthly allowance of free searches. It reuses the trial
-- counters, so debit_credits_v2 and refunds work unchanged: the counters are
-- topped up each calendar month (Eastern) and expire at the month's end.

alter table trial_entitlements drop constraint if exists trial_entitlements_discovery_remaining_check;
alter table trial_entitlements drop constraint if exists trial_entitlements_contact_lookups_remaining_check;
alter table trial_entitlements
  add constraint trial_entitlements_discovery_remaining_check check (discovery_remaining between 0 and 100),
  add constraint trial_entitlements_contact_lookups_remaining_check check (contact_lookups_remaining between 0 and 200);

-- 'trial' for the public 7-day trial, 'speaker_island' for the monthly allowance.
alter table trial_entitlements add column if not exists source text not null default 'trial'
  check (source in ('trial', 'speaker_island'));

create table if not exists speaker_island_members (
  profile_id uuid primary key references profiles(id) on delete cascade,
  member_type text not null check (member_type in ('cast', 'community')),
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_grant_month date
);
alter table speaker_island_members enable row level security;
create policy "speaker_island_members: read own"
  on speaker_island_members for select using (profile_id = auth.uid());

-- One-time sign-in links from the Portal: each nonce works once.
create table if not exists portal_sso_nonces (
  nonce text primary key,
  used_at timestamptz not null default now()
);
alter table portal_sso_nonces enable row level security;

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
    format('Speaker Island: %s searches and %s contact lookups for %s', p_searches, p_lookups, to_char(this_month, 'FMMonth YYYY'))
  );

  update speaker_island_members set last_grant_month = this_month where profile_id = p_profile_id;
  return true;
end;
$$;

revoke all on function grant_speaker_island_month(uuid, integer, integer) from public, anon, authenticated;
grant execute on function grant_speaker_island_month(uuid, integer, integer) to service_role;
