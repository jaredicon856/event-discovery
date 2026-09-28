-- Supabase may apply explicit anon/authenticated EXECUTE grants through
-- default privileges; revoke those roles in addition to PUBLIC.

revoke all on function accept_invitation(uuid, text) from public, anon, authenticated;
revoke all on function bootstrap_first_super_admin(uuid) from public, anon, authenticated;
revoke all on function admin_adjust_manual_credits(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function debit_credits(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function debit_credits_v2(uuid, integer, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function complete_credit_operation(text) from public, anon, authenticated;
revoke all on function refund_credit_operation(text) from public, anon, authenticated;
revoke all on function recover_stale_credit_operations(interval) from public, anon, authenticated;
revoke all on function grant_subscription_cycle(uuid, integer, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function grant_paid_upgrade(uuid, integer, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function handle_new_user() from public, anon, authenticated, service_role;

grant execute on function accept_invitation(uuid, text) to service_role;
grant execute on function bootstrap_first_super_admin(uuid) to service_role;
grant execute on function admin_adjust_manual_credits(uuid, uuid, integer, text) to service_role;
grant execute on function debit_credits_v2(uuid, integer, text, text, uuid, uuid) to service_role;
grant execute on function complete_credit_operation(text) to service_role;
grant execute on function refund_credit_operation(text) to service_role;
grant execute on function recover_stale_credit_operations(interval) to service_role;
grant execute on function grant_subscription_cycle(uuid, integer, timestamptz, text, text, text) to service_role;
grant execute on function grant_paid_upgrade(uuid, integer, timestamptz, text, text, text) to service_role;

alter function keep_admin_audit_immutable() set search_path = public;
