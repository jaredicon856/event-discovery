import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { canScheduleSearch } from "@/lib/credits";
import { featureDisabledResponse } from "@/lib/featureFlags";

export async function GET() {
  try {
    const { service, profile } = await requireActiveUser();
    const { data, error } = await service
      .from("discovery_schedules")
      .select("*")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ schedules: data ?? [] });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load schedules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  let body: { sector?: string; query?: string; maxAutoContactLookups?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sector || !body.query) {
    return NextResponse.json({ error: "sector and query are required" }, { status: 400 });
  }
  const disabled = await featureDisabledResponse(context.service, "scheduling", context.profile.id);
  if (disabled) return disabled;
  const { data: paidSubscription } = await context.service
    .from("subscriptions")
    .select("id")
    .eq("profile_id", context.profile.id)
    .in("status", ["active", "past_due"])
    .gt("current_period_end", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (!canScheduleSearch(context.profile.role, Boolean(paidSubscription))) {
    return NextResponse.json(
      {
        error: "Scheduled searches are available on paid plans after the free trial",
        code: "paid_plan_required",
      },
      { status: 402 }
    );
  }
  const maxAutoContactLookups = Math.max(
    0,
    Math.min(10, Math.floor(body.maxAutoContactLookups ?? 7))
  );

  const { data, error } = await context.service
    .from("discovery_schedules")
    .insert({
      sector: body.sector,
      query: body.query,
      profile_id: context.profile.id,
      max_auto_contact_lookups: maxAutoContactLookups,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}
