-- Real accounts, credit ledger, and subscriptions — the foundation for the
-- credit-based SaaS. One Supabase Auth user = one profile = one account.
-- Events/contacts stay a SHARED dataset across all customers (this app
-- meters *access* to the discovery/enrichment agents, not per-tenant data) —
-- a deliberate scope decision, not an oversight.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'super_admin')),
  disabled boolean not null default false,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create index profiles_email_idx on profiles (email);

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  plan text not null check (plan in ('starter', 'growth', 'scale')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'incomplete')),
  credits_per_cycle integer not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_profile_id_idx on subscriptions (profile_id);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row
  execute function set_updated_at();

-- Every credit grant, top-up, and usage debit is one ledger row — balance is
-- always the sum, never a mutated counter, so it can't drift or be double-spent.
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  delta integer not null,
  reason text not null check (
    reason in ('monthly_grant', 'topup', 'discovery_usage', 'enrichment_usage', 'admin_adjustment')
  ),
  related_event_id uuid references events(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index credit_ledger_profile_id_idx on credit_ledger (profile_id);
create index credit_ledger_created_at_idx on credit_ledger (profile_id, created_at desc);

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table credit_ledger enable row level security;

-- Users can see their own profile/subscription/ledger rows; all writes go
-- through the service-role server (API routes), never directly from the
-- browser, so there are no INSERT/UPDATE policies here at all.
create policy "profiles: read own" on profiles for select using (auth.uid() = id);
create policy "subscriptions: read own" on subscriptions for select using (auth.uid() = profile_id);
create policy "credit_ledger: read own" on credit_ledger for select using (auth.uid() = profile_id);
