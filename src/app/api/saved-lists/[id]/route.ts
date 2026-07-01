import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { applyEventFilters, hasAnyFilter } from "@/lib/filters";
import { savedListToFilters } from "@/lib/savedLists";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";
import type { SavedListRecord } from "@/types/event";

/**
 * Deletes the saved list AND every event currently matching its filter
 * criteria — this is a real, permanent data deletion, not just removing the
 * saved shortcut. The UI must confirm with the user (and show the event
 * count) before calling this.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: list, error: fetchError } = await supabase
    .from("saved_lists")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !list) {
    return NextResponse.json({ error: fetchError?.message ?? "List not found" }, { status: 404 });
  }

  const row = list as SavedListRecord;
  const filters = savedListToFilters(row);

  if (!hasAnyFilter(filters)) {
    return NextResponse.json(
      { error: "Refusing to delete: this list has no filter criteria, which would match every event" },
      { status: 400 }
    );
  }

  const deleteQuery = applyEventFilters(supabase.from("events").delete().select("id"), filters);
  const { data: deletedEvents, error: deleteError } = await deleteQuery;

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: listDeleteError } = await supabase.from("saved_lists").delete().eq("id", id);
  if (listDeleteError) {
    return NextResponse.json({ error: listDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({ deletedList: true, deletedEvents: deletedEvents?.length ?? 0 });
}
