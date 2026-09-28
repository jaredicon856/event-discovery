create or replace function admin_adjust_manual_credits(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_amount integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger_id uuid;
begin
  if p_amount = 0 then raise exception 'Adjustment cannot be zero'; end if;
  if length(trim(p_reason)) < 3 then raise exception 'A reason is required'; end if;
  if not exists (
    select 1 from profiles
    where id = p_actor_profile_id and role = 'super_admin' and access_status = 'active'
  ) then raise exception 'Active super-admin required'; end if;
  if not exists (select 1 from profiles where id = p_target_profile_id) then
    raise exception 'Target member not found';
  end if;

  insert into credit_ledger(
    profile_id, delta, reason, balance_bucket, created_by, note
  ) values (
    p_target_profile_id, p_amount, 'admin_adjustment', 'manual',
    p_actor_profile_id, p_reason
  ) returning id into ledger_id;

  insert into admin_audit_log(
    actor_profile_id, target_profile_id, action, reason, details
  ) values (
    p_actor_profile_id, p_target_profile_id, 'manual_credit_adjustment',
    p_reason, jsonb_build_object('amount', p_amount, 'ledger_id', ledger_id)
  );
  return ledger_id;
end;
$$;

revoke all on function admin_adjust_manual_credits(uuid,uuid,integer,text) from public;
grant execute on function admin_adjust_manual_credits(uuid,uuid,integer,text) to service_role;
