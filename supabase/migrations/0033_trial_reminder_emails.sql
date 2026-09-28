-- Tracks the one-time "trial ends soon" and "trial ended" emails so the daily
-- job never sends either message twice to the same account.
alter table trial_entitlements
  add column ending_reminder_sent_at timestamptz,
  add column expired_notice_sent_at timestamptz;

create index trial_entitlements_expires_at_idx on trial_entitlements (expires_at);
