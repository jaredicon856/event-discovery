import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { findEventContacts } from "@/lib/agent";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data: event, error: fetchError } = await supabase
    .from("events")
    .select("id, event_name, source_url, booking_path")
    .eq("id", body.eventId)
    .single();

  if (fetchError || !event) {
    return NextResponse.json({ error: fetchError?.message ?? "Event not found" }, { status: 404 });
  }

  const contacts = await findEventContacts({
    eventName: event.event_name,
    sourceUrl: event.source_url,
    bookingPath: event.booking_path,
  });

  if (contacts.length === 0) {
    return NextResponse.json({ inserted: 0, contacts: [] });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert(contacts.map((c) => ({ ...c, event_id: event.id, found_via: "agent_search" })))
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data?.length ?? 0, contacts: data });
}
