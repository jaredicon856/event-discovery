import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { hasAnyFilter, type EventFilters } from "@/lib/filters";
import { getSavedListsWithCounts } from "@/lib/savedLists";
import { featureDisabledResponse } from "@/lib/featureFlags";

export async function GET() {
  try {
    const { service, profile } = await requireActiveUser();
    const lists = await getSavedListsWithCounts(service, profile.id);
    return NextResponse.json({ lists });
  } catch (error) {
    const accessResponse = accessErrorResponse(error);
    if (accessResponse) return accessResponse;
    const message = error instanceof Error ? error.message : "Failed to load saved lists";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }
  const disabled = await featureDisabledResponse(context.service, "saved_lists", context.profile.id);
  if (disabled) return disabled;

  let body: {
    name?: string;
    sector?: string;
    tier?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
    runId?: string;
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
    runId: body.runId,
  };

  if (!hasAnyFilter(filters)) {
    return NextResponse.json(
      { error: "Apply at least one filter before saving a list" },
      { status: 400 }
    );
  }
  if (filters.runId) {
    const { data: ownedRun } = await context.service
      .from("discovery_runs")
      .select("id")
      .eq("id", filters.runId)
      .eq("profile_id", context.profile.id)
      .eq("run_kind", "customer")
      .maybeSingle();
    if (!ownedRun) {
      return NextResponse.json({ error: "Discovery run not found" }, { status: 404 });
    }
  }

  const { data, error } = await context.service
    .from("saved_lists")
    .insert({
      profile_id: context.profile.id,
      name: body.name,
      sector: filters.sector ?? null,
      tier: filters.tier ?? null,
      status: filters.status ?? null,
      from_date: filters.from ?? null,
      to_date: filters.to ?? null,
      q: filters.q ?? null,
      discovery_run_id: filters.runId ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ list: data });
}
