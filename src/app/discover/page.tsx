import { getSupabaseServiceClient } from "@/lib/supabase";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { SchedulesPanel } from "@/components/SchedulesPanel";
import type { DiscoveryScheduleRecord } from "@/types/event";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("discovery_schedules")
    .select("*")
    .order("created_at", { ascending: false });

  const schedules = (error ? [] : (data ?? [])) as DiscoveryScheduleRecord[];

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Discover</h1>
          <p className="text-sm text-icon-text-light">
            Run a new AI web search for events, or manage searches that repeat automatically.
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            Couldn&apos;t load scheduled searches: {error.message}
          </div>
        )}

        <DiscoverPanel />
        <SchedulesPanel schedules={schedules} />
      </div>
    </div>
  );
}
