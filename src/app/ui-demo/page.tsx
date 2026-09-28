import { notFound } from "next/navigation";
import { SearchProgress } from "@/components/SearchProgress";
import { EventsTable } from "@/components/EventsTable";
import { FilterBar } from "@/components/FilterBar";
import type { EventRecord } from "@/types/event";

const DEMO_EVENTS: EventRecord[] = [
  {
    id: "demo-1",
    sector: "Healthcare & life sciences",
    event_name: "Healthcare Leadership Exchange",
    opportunity_type: "Executive conference panel",
    event_start: "2027-03-18",
    event_end: "2027-03-19",
    date_notes: null,
    city: "Chicago",
    state_country: "United States",
    venue_format: "In person",
    status: "open",
    cfp_deadline: "2026-11-15",
    audience_reach: "Hospital and health-system executives",
    potential_cost: null,
    why_it_matters: "Senior operator audience with an active transformation agenda.",
    best_client_fit: "Healthcare transformation and operational leadership experts",
    booking_path: "Submit via the published call for speakers",
    source_url: "https://example.com/healthcare-leadership",
    visibility_tier: "A",
    source_id: null,
    discovered_via: "ui_demo",
    discovery_query: "healthcare executive leadership",
    discovery_run_id: "demo",
    raw_extract: {},
    created_at: "2026-09-22T17:00:00.000Z",
    updated_at: "2026-09-22T17:00:00.000Z",
  },
  {
    id: "demo-2",
    sector: "Healthcare & life sciences",
    event_name: "The Future of Care Podcast",
    opportunity_type: "Podcast",
    event_start: null,
    event_end: null,
    date_notes: "Standing / ongoing guest program",
    city: null,
    state_country: "Remote",
    venue_format: "Podcast",
    status: "open",
    cfp_deadline: null,
    audience_reach: "Healthcare founders and operators",
    potential_cost: null,
    why_it_matters: "A focused audience and an active guest pitch form.",
    best_client_fit: "Digital health founders and clinical innovation leaders",
    booking_path: "Pitch via the current guest form",
    source_url: "https://example.com/future-of-care",
    visibility_tier: "B",
    source_id: null,
    discovered_via: "ui_demo",
    discovery_query: "healthcare podcasts",
    discovery_run_id: "demo",
    raw_extract: {},
    created_at: "2026-09-22T17:00:00.000Z",
    updated_at: "2026-09-22T17:00:00.000Z",
  },
];

export default function UiDemoPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const now = new Date().toISOString();

  return (
    <main className="theme-panel premium-page min-h-screen bg-icon-background px-5 py-6 text-icon-text sm:px-8 lg:px-10 lg:py-8">
      <div className="mx-auto grid max-w-7xl gap-4">
        <header className="animate-enter">
          <p className="premium-eyebrow">Development preview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Opportunity results</h1>
          <p className="mt-2 text-sm text-icon-text-light">Layout preview only—no searches or credits are used.</p>
        </header>
        <SearchProgress
          runId="ui-demo"
          preview={{
            status: "running",
            current_stage: "validation",
            last_completed_stage: "extraction",
            stage_summaries: [
              { stage: "queued", at: now },
              { stage: "research", at: now },
              { stage: "extraction", at: now },
            ],
            error_message: null,
            created_at: now,
            completed_at: null,
          }}
        />
        <section className="premium-card grid gap-3 p-4 sm:grid-cols-[1.5fr_repeat(3,.5fr)]">
          <div>
            <p className="premium-eyebrow">Search summary</p>
            <p className="mt-1.5 font-semibold">Healthcare leadership opportunities</p>
            <p className="mt-1.5 text-xs font-medium uppercase tracking-[.08em] text-icon-text-light">Healthcare · Sep 23, 2026</p>
          </div>
          <div className="border-l border-icon-border pl-3"><p className="text-xs text-icon-text-light">Matches</p><p className="mt-1 text-2xl font-semibold">2</p></div>
          <div className="border-l border-icon-border pl-3"><p className="text-xs text-icon-text-light">Contacts</p><p className="mt-1 text-2xl font-semibold">0</p></div>
          <div className="border-l border-icon-border pl-3"><p className="text-xs text-icon-text-light">Credits used</p><p className="mt-1 text-lg font-semibold">20</p></div>
        </section>
        <FilterBar filters={{}} latestRunId={null} allowSave={false} />
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="premium-eyebrow">Your matches</p>
              <h2 className="mt-1.5 text-xl font-semibold tracking-[-.03em]">2 opportunities</h2>
            </div>
            <p className="text-sm text-icon-text-light">Best matches appear first.</p>
          </div>
          <EventsTable events={DEMO_EVENTS} initialContacts={{}} isOwner />
        </section>
      </div>
    </main>
  );
}
