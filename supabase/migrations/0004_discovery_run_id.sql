-- Tags every event with the discovery run that produced/refreshed it, so the
-- dashboard can default to showing "just the latest search" instead of the
-- full accumulated table.
alter table events add column discovery_run_id uuid;
create index events_discovery_run_id_idx on events (discovery_run_id);

-- A saved list can now be "the results of this specific discovery run" in
-- addition to the existing sector/tier/status/date/keyword filter criteria.
alter table saved_lists add column discovery_run_id uuid;
