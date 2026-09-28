-- Preserve the normalized-email trial claim if an auth/profile account is
-- deleted, while allowing privacy/account-deletion workflows to complete.
alter table trial_claims alter column profile_id drop not null;
alter table trial_claims drop constraint trial_claims_profile_id_fkey;
alter table trial_claims
  add constraint trial_claims_profile_id_fkey
  foreign key (profile_id) references profiles(id) on delete set null;
