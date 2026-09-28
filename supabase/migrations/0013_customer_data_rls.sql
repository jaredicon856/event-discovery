-- Browser/database API isolation. Application writes remain service-role only.

alter table saved_lists enable row level security;
alter table discovery_schedules enable row level security;
alter table events enable row level security;
alter table contacts enable row level security;

drop policy if exists "saved_lists: read own" on saved_lists;
create policy "saved_lists: read own" on saved_lists for select using (
  auth.uid() = profile_id and exists (
    select 1 from profiles where id = auth.uid() and access_status = 'active'
  )
);

drop policy if exists "discovery_schedules: read own" on discovery_schedules;
create policy "discovery_schedules: read own" on discovery_schedules for select using (
  auth.uid() = profile_id and exists (
    select 1 from profiles where id = auth.uid() and access_status = 'active'
  )
);

-- Shared opportunity records are intentionally served by authenticated app
-- routes. No direct events/contacts policies prevents public anon scraping.
