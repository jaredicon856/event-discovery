import { requireActiveUser } from "@/lib/access";
import { getSavedListsWithCounts } from "@/lib/savedLists";
import { SavedListsPanel } from "@/components/SavedListsPanel";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const { service, profile } = await requireActiveUser();
  const lists = await getSavedListsWithCounts(service, profile.id);

  return (
    <div className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Saved Lists</h1>
          <p className="text-sm text-icon-text-light">
            Organize shortcuts to selected My Opportunities views and search batches. Removing a
            list never deletes the underlying opportunity results.
          </p>
        </header>

        <SavedListsPanel lists={lists} />
      </div>
    </div>
  );
}
