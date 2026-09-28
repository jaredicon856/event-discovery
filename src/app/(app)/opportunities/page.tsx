import Link from "next/link";
import { requireActiveUser } from "@/lib/access";
import { applyEventFilters, eventsBaseQuery, hasAnyFilter, parseFilters } from "@/lib/filters";
import { FilterBar } from "@/components/FilterBar";
import { EventsTable } from "@/components/EventsTable";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { SearchProgress } from "@/components/SearchProgress";
import { SchedulesPanel } from "@/components/SchedulesPanel";
import type { ContactRecord, DiscoveryScheduleRecord, EventRecord } from "@/types/event";
import {
  canScheduleSearch,
  getCreditBalances,
  getNonTrialCreditBalance,
} from "@/lib/credits";
import { formatAccountDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * failure_class values are internal (see FailureClass in opportunityValidation.ts) —
 * translate the ones a customer can actually hit into a plain-language,
 * actionable message instead of the raw technical error_message.
 */
function failureMessage(activeRun: { failure_class: string | null; error_message: string | null }): string {
  if (activeRun.failure_class === "extraction_truncated") {
    return "We could not finish organizing the results, so this search was refunded.";
  }
  if (activeRun.failure_class === "budget_exhausted") {
    return "This search needed unusually deep research and hit a safety limit before finishing. Credits were refunded — try again, or narrow your criteria (fewer sectors/types, a shorter date range) for a more focused search.";
  }
  return activeRun.error_message ?? "This search could not be completed.";
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") usp.set(key, value);
  }
  const tab = usp.get("tab") === "new" || usp.get("tab") === "previous" ? usp.get("tab")! : "results";
  const filters = parseFilters(usp);
  const browsingFiltered = hasAnyFilter(filters);
  const hasNonRunFilters = hasAnyFilter({ ...filters, runId: undefined });
  const viewAll = usp.get("view") === "all";
  const { service, profile } = await requireActiveUser();
  const runSelect =
    "id, sector, query, status, current_stage, events_found, related_count, contact_lookups_attempted, contact_lookups_failed, contacts_found, credits_charged, credits_refunded, error_message, failure_class, billing_mode, created_at, completed_at";

  const [
    { data: customerRuns },
    { data: latestRun },
    { data: requestedRun },
    { data: previousRuns },
    { data: schedules, error: scheduleError },
    { data: subscription },
    { data: trial },
    creditBalances,
  ] = await Promise.all([
    service.from("discovery_runs").select("id").eq("profile_id", profile.id).eq("run_kind", "customer"),
    service
      .from("discovery_runs")
      .select(runSelect)
      .eq("profile_id", profile.id)
      .eq("run_kind", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    filters.runId
      ? service.from("discovery_runs").select(runSelect).eq("profile_id", profile.id).eq("run_kind", "customer").eq("id", filters.runId).maybeSingle()
      : Promise.resolve({ data: null }),
    service
      .from("discovery_runs")
      .select(runSelect)
      .eq("profile_id", profile.id)
      .eq("run_kind", "customer")
      .order("created_at", { ascending: false })
      .limit(25),
    service.from("discovery_schedules").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }),
    service
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("profile_id", profile.id)
      .in("status", ["active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service.from("trial_entitlements").select("discovery_remaining, contact_lookups_remaining").eq("profile_id", profile.id).maybeSingle(),
    getCreditBalances(service, profile.id),
  ]);

  const customerRunIds = (customerRuns ?? []).map((run) => run.id);
  const { data: allLinks } = customerRunIds.length
    ? await service.from("discovery_run_events").select("event_id, discovery_run_id, match_kind, mismatch_reasons").in("discovery_run_id", customerRunIds)
    : { data: [] };
  const customerEventIds = [...new Set((allLinks ?? []).map((link) => link.event_id))];
  const requestedRunMissing = Boolean(filters.runId && !requestedRun);
  const activeRun = filters.runId ? requestedRun : !hasNonRunFilters && !viewAll ? latestRun : null;
  const latestRunId = latestRun?.id ?? null;
  const isOwner = profile.role === "super_admin";
  const canSchedule = canScheduleSearch(profile.role, Boolean(subscription?.current_period_end));
  const nonTrialCredits = getNonTrialCreditBalance(creditBalances);
  const trialDiscoveryRemaining = trial?.discovery_remaining ?? 0;
  const trialContactsRemaining = trial?.contact_lookups_remaining ?? 0;
  const contactCreditBudget =
    trialDiscoveryRemaining > 0
      ? trialContactsRemaining * 20 + nonTrialCredits
      : Math.max(0, nonTrialCredits - 20);
  const maxContactLookups = isOwner
    ? 10
    : Math.max(0, Math.min(10, Math.floor(contactCreditBudget / 20)));

  let events: EventRecord[] = [];
  let relatedEvents: EventRecord[] = [];
  let errorMessage: string | null = requestedRunMissing ? "That search was not found in your workspace." : null;
  try {
    if (!requestedRunMissing && activeRun) {
      const { data: links, error } = await service
        .from("discovery_run_events")
        .select("event_id, match_kind, mismatch_reasons")
        .eq("discovery_run_id", activeRun.id)
        .order("result_order");
      if (error) throw error;
      const exactIds = (links ?? []).filter((link) => link.match_kind !== "related").map((link) => link.event_id);
      const relatedIds = (links ?? []).filter((link) => link.match_kind === "related").map((link) => link.event_id);
      const relatedReasons = new Map((links ?? []).map((link) => [link.event_id, link.mismatch_reasons ?? []]));
      if (exactIds.length > 0) {
        const base = eventsBaseQuery(service).in("id", exactIds);
        const result = hasNonRunFilters ? await applyEventFilters(base, { ...filters, runId: undefined }) : await base;
        if (result.error) throw result.error;
        events = (result.data ?? []) as EventRecord[];
      }
      if (relatedIds.length > 0) {
        // Was skipped entirely (not merely left unfiltered) whenever any
        // filter was set — a run with only related results went completely
        // blank the moment the sector/tier/status/date/search bar was
        // touched at all, instead of the related list actually being
        // filtered the same way the exact-match list already is above.
        const relatedBase = eventsBaseQuery(service).in("id", relatedIds);
        const result = hasNonRunFilters
          ? await applyEventFilters(relatedBase, { ...filters, runId: undefined })
          : await relatedBase;
        if (result.error) throw result.error;
        relatedEvents = ((result.data ?? []) as EventRecord[]).map((event) => ({
          ...event,
          match_kind: "related",
          mismatch_reasons: relatedReasons.get(event.id) ?? [],
        }));
      }
    } else if ((browsingFiltered || viewAll) && customerEventIds.length > 0) {
      const result = await applyEventFilters(eventsBaseQuery(service).in("id", customerEventIds), { ...filters, runId: undefined });
      if (result.error) throw result.error;
      events = (result.data ?? []) as EventRecord[];
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Failed to load opportunities";
  }

  const contactsByEvent: Record<string, ContactRecord[]> = {};
  const contactEventIds = [...events, ...relatedEvents].map((event) => event.id);
  if (contactEventIds.length > 0) {
    const { data: contactLinks } = await service
      .from("customer_event_contacts")
      .select("contact_id, event_id")
      .eq("profile_id", profile.id)
      .in("event_id", contactEventIds);
    const contactIds = (contactLinks ?? []).map((link) => link.contact_id);
    const { data: contacts } = contactIds.length ? await service.from("contacts").select("*").in("id", contactIds) : { data: [] };
    const contactById = new Map((contacts ?? []).map((contact) => [contact.id, contact]));
    for (const link of contactLinks ?? []) {
      const contact = contactById.get(link.contact_id);
      if (contact) (contactsByEvent[link.event_id] ??= []).push(contact as ContactRecord);
    }
  }

  const exportParams = new URLSearchParams(usp);
  if (!browsingFiltered && !viewAll && latestRunId) exportParams.set("runId", latestRunId);
  const showExports = events.length > 0;
  const inProgress = activeRun && ["queued", "running"].includes(activeRun.status);
  // Must exclude runId here — every "view this run's results" page carries a
  // runId, so using browsingFiltered (which counts runId as a filter) showed
  // "Results are hidden by filters" for any run that simply found nothing,
  // even when the sector/tier/status/date/search dropdowns were untouched.
  const filteredEmpty = events.length === 0 && hasNonRunFilters;
  const legacyZeroRun = Boolean(
    activeRun &&
      activeRun.status === "completed" &&
      activeRun.events_found === 0 &&
      activeRun.current_stage === "queued"
  );
  const tabs = [
    ["new", "New search"],
    ["results", "Results"],
    ["previous", "Previous searches"],
  ] as const;

  return (
    <div className="premium-page min-h-screen px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="animate-enter flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="premium-eyebrow">Find opportunities</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Opportunities</h1>
            <p className="mt-2 text-sm text-icon-text-light">Search for opportunities, review your matches, and find the right contacts.</p>
          </div>
          {showExports && (
            <div className="flex flex-wrap gap-2">
              <a href={`/api/export?${exportParams.toString()}`} className="premium-button flex items-center border border-icon-primary text-icon-primary hover:bg-icon-primary-light">Export CSV</a>
              <ExportPdfButton filters={Object.fromEntries(exportParams.entries())} />
            </div>
          )}
        </header>

        <nav className="animate-enter flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-icon-border bg-icon-surface p-1 shadow-sm" style={{ animationDelay: "80ms" }}>
          {tabs.map(([id, label]) => (
            <Link key={id} href={id === "results" && activeRun ? `/opportunities?tab=results&runId=${activeRun.id}` : `/opportunities?tab=${id}`} className={`min-h-10 rounded-full px-4 py-2.5 text-sm font-semibold transition-all ${tab === id ? "bg-icon-primary text-white shadow-sm" : "text-icon-text-light hover:bg-icon-primary-light hover:text-icon-text"}`}>
              {label}
            </Link>
          ))}
        </nav>

        {tab === "new" && (
          <>
            <DiscoverPanel
              canSchedule={canSchedule}
              defaultContactLimit={Math.min(7, maxContactLookups)}
              maxContactLookups={maxContactLookups}
              trialSearchRemaining={trial?.discovery_remaining}
              nonTrialCredits={nonTrialCredits}
              isOwner={isOwner}
            />
            {canSchedule && <SchedulesPanel schedules={(scheduleError ? [] : (schedules ?? [])) as DiscoveryScheduleRecord[]} />}
          </>
        )}

        {tab === "previous" && (
          <section className="grid gap-3">
            {(previousRuns ?? []).map((run, index) => {
              const legacyEmpty = run.status === "completed" && run.events_found === 0 && run.current_stage === "queued";
              return (
              <Link key={run.id} href={`/opportunities?tab=results&runId=${run.id}`} className="reveal-card premium-card p-5 transition-all hover:-translate-y-0.5 hover:border-icon-primary" style={{ "--reveal-index": index } as React.CSSProperties}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{run.query}</p>
                    <p className="mt-1 text-xs text-icon-text-light">{run.sector} · {formatAccountDate(run.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${legacyEmpty ? "bg-stone-100 text-stone-600" : "bg-icon-primary-light text-icon-primary"}`}>{legacyEmpty ? "Earlier · no opportunities" : run.status.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-2 text-sm text-icon-text-light">{run.events_found} verified · {run.related_count ?? 0} related</p>
              </Link>
            )})}
            {(previousRuns ?? []).length === 0 && <p className="rounded-xl border border-dashed border-icon-border p-8 text-sm text-icon-text-light">Previous searches will appear here.</p>}
          </section>
        )}

        {tab === "results" && (
          <>
            {errorMessage && <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{errorMessage}</p>}
            {activeRun && inProgress && <SearchProgress runId={activeRun.id} />}
            {activeRun && (
              <section className="premium-card animate-enter grid gap-3 overflow-hidden p-4 sm:grid-cols-[1.5fr_repeat(3,.5fr)]">
                <div>
                  <p className="premium-eyebrow">{legacyZeroRun ? "Earlier search" : "Search summary"}</p>
                  <p className="mt-1.5 font-semibold leading-snug">{activeRun.query}</p>
                  <p className="mt-1.5 text-xs font-medium uppercase tracking-[.08em] text-icon-text-light">{activeRun.sector} · {formatAccountDate(activeRun.created_at)}</p>
                  {legacyZeroRun && (
                    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                      <p className="text-sm font-semibold text-stone-700">Earlier search · No opportunities</p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">
                        This search was completed before detailed progress tracking was added, so we cannot confirm why it returned no matches.
                      </p>
                    </div>
                  )}
                  {activeRun.error_message && <p className="mt-2 text-xs text-amber-700">{activeRun.error_message}</p>}
                </div>
                <div className="border-l border-icon-border pl-3"><p className="text-xs text-icon-text-light">Matches</p><p className="mt-1 text-2xl font-semibold tracking-[-.04em]">{activeRun.events_found}</p></div>
                <div className="border-l border-icon-border pl-3"><p className="text-xs text-icon-text-light">Contacts</p><p className="mt-1 text-2xl font-semibold tracking-[-.04em]">{activeRun.contacts_found}</p></div>
                <div className="border-l border-icon-border pl-3"><p className="text-xs text-icon-text-light">{activeRun.billing_mode === "owner_unbilled" ? "Cost" : "Credits used"}</p><p className="mt-1 text-lg font-semibold">{activeRun.billing_mode === "owner_unbilled" ? "Included" : Math.max(0, activeRun.credits_charged - activeRun.credits_refunded)}</p></div>
              </section>
            )}
            <FilterBar filters={filters} latestRunId={activeRun?.id ?? latestRunId} allowSave={events.length > 0} viewAll={viewAll} />
            {filteredEmpty && (
              <div className="rounded-xl border border-dashed border-icon-border p-8 text-center">
                <p className="font-semibold">Results are hidden by filters</p>
                <Link href={activeRun ? `/opportunities?tab=results&runId=${activeRun.id}` : "/opportunities?tab=results"} className="mt-3 inline-block text-sm font-semibold text-icon-primary">Clear filters</Link>
              </div>
            )}
            {!filteredEmpty && !legacyZeroRun && (activeRun?.status === "no_matches" || (activeRun && !inProgress && activeRun.events_found === 0 && activeRun.status === "completed")) && (
              <div className="premium-card p-6">
                <p className="text-lg font-semibold">No opportunities matched this search</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-icon-text-light">The search completed and used the displayed credits. Try broader dates, locations, or opportunity types.</p>
                <Link href="/opportunities?tab=new" className="mt-4 inline-block text-sm font-semibold text-icon-primary">Change search criteria</Link>
              </div>
            )}
            {(activeRun?.status === "failed" || activeRun?.status === "refunded") && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-6">
                <p className="font-semibold text-amber-900">Research failed</p>
                <p className="mt-2 text-sm text-amber-800">{failureMessage(activeRun)} Credits were returned when applicable.</p>
              </div>
            )}
            <EventsTable events={events} initialContacts={contactsByEvent} isOwner={isOwner} />
            {relatedEvents.length > 0 && (
              <section className="grid gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Related suggestions</h2>
                  <p className="text-sm text-icon-text-light">These do not fully match your criteria and were not included in paid contact research.</p>
                </div>
                <EventsTable events={relatedEvents} initialContacts={contactsByEvent} isOwner={isOwner} related />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
