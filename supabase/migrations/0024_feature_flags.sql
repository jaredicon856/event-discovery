-- Super-admin controlled kill switches for product features (Discovery,
-- Enrichment, PDF Export, Scheduling, Saved Lists), global or per-customer.

create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope text not null check (scope in ('global', 'profile')),
  profile_id uuid references profiles(id) on delete cascade,
  enabled boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    (scope = 'global' and profile_id is null) or
    (scope = 'profile' and profile_id is not null)
  )
);

create unique index feature_flags_key_scope_profile_idx
  on feature_flags (key, scope, coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index feature_flags_profile_idx on feature_flags (profile_id) where profile_id is not null;

alter table feature_flags enable row level security;

-- Reads only: every authenticated user can see global rows plus their own
-- profile-scoped overrides. All writes go through the service role from
-- admin API routes (same pattern as every other admin-controlled table).
create policy "feature_flags: read global and own"
  on feature_flags for select
  to authenticated
  using (scope = 'global' or profile_id = auth.uid());
