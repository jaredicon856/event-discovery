import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { hasAnyFilter, type EventFilters } from "@/lib/filters";
import { getSavedListsWithCounts } from "@/lib/savedLists";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  const supabase = getSupabaseServiceClient();
  try {
    const lists = await getSavedListsWithCounts(supabase);
    return NextResponse.json({ lists });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load saved lists";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  let body: {
    name?: string;
    sector?: string;
    tier?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const filters: EventFilters = {
    sector: body.sector,
    tier: body.tier,
    status: body.status,
    from: body.from,
    to: body.to,
    q: body.q,
  };

  if (!hasAnyFilter(filters)) {
    return NextResponse.json(
      { error: "Apply at least one filter before saving a list" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("saved_lists")
    .insert({
      name: body.name,
      sector: filters.sector ?? null,
      tier: filters.tier ?? null,
      status: filters.status ?? null,
      from_date: filters.from ?? null,
      to_date: filters.to ?? null,
      q: filters.q ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ list: data });
}
