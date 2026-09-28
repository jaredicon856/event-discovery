alter table profiles add column password_enabled_at timestamptz;
alter table discovery_runs
  add column contact_lookups_failed integer not null default 0
    check (contact_lookups_failed >= 0);
