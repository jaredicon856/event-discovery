import { getSupabaseServiceClient } from "@/lib/supabase";
import { getSavedListsWithCounts } from "@/lib/savedLists";
import { SavedListsPanel } from "@/components/SavedListsPanel";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const supabase = getSupabaseServiceClient();
  const lists = await getSavedListsWithCounts(supabase);

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Saved Lists</h1>
          <p className="text-sm text-icon-text-light">
            Named filter presets and saved search batches. Click a list to apply it on the Overview
            page, or clear it (and its matching events) entirely.
          </p>
        </header>

        <SavedListsPanel lists={lists} />
      </div>
    </div>
  );
}
