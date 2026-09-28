import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";

/** Deletes only the member-owned shortcut. Shared events/contacts are immutable here. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const { id } = await params;
  const { data, error } = await context.service
    .from("saved_lists")
    .delete()
    .eq("id", id)
    .eq("profile_id", context.profile.id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Saved list not found" }, { status: 404 });
  return NextResponse.json({ deletedList: true });
}
