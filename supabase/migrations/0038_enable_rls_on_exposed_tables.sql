-- Applied to production on 2026-11-19.
-- These tables were readable and writable with the public anon key.
-- Enabling RLS with no policies matches the rest of the project: only the
-- server-side service key can reach them.
alter table public.ops_task_collaborators enable row level security;
alter table public.deal_whop_reconcile enable row level security;
alter table public.whop_payment_field_overrides enable row level security;
alter table public.ever_hot_opportunities enable row level security;
alter table public.sales_report_runs enable row level security;
alter table public.ops_fathom_recaps enable row level security;
alter table public.ops_podcast_launch_notices enable row level security;
alter table public.whop_disputes enable row level security;
alter table public.ops_client_stage_tasks enable row level security;
