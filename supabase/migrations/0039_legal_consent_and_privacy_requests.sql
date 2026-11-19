-- Proof of who accepted which version of the Terms and Privacy Policy, and when.
create table legal_consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  version text not null,
  source text not null check (source in ('signup', 'gate')),
  accepted_at timestamptz not null default now()
);
create index legal_consents_profile_version_idx on legal_consents (profile_id, version);
alter table legal_consents enable row level security;

-- Data export and account deletion requests, so each one has an owner and a deadline.
create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  email text not null,
  kind text not null check (kind in ('export', 'delete')),
  status text not null default 'open' check (status in ('open', 'done', 'declined')),
  note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create unique index privacy_requests_one_open_per_kind on privacy_requests (profile_id, kind) where status = 'open';
create index privacy_requests_status_idx on privacy_requests (status, created_at);
alter table privacy_requests enable row level security;

-- Customers who unsubscribe from trial and welcome emails (receipts and security emails still send).
alter table profiles add column email_opt_out_at timestamptz;
