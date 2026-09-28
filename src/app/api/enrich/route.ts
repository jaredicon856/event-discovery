import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { featureDisabledResponse } from "@/lib/featureFlags";
import { enrichAndSaveContacts } from "@/lib/enrichment";
import {
  CREDIT_COSTS,
  completeCreditOperation,
  getUsageEntitlement,
  InsufficientCreditsError,
  refundUsageCredits,
  requireAndDebitCredits,
} from "@/lib/credits";

export const maxDuration = 240;

export async function POST(request: NextRequest) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const disabled = await featureDisabledResponse(context.service, "enrichment", context.profile.id);
  if (disabled) return disabled;

  let body: { eventId?: string; force?: boolean; operationKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const supabase = context.service;
  const { data: runLinks, error: runLinksError } = await supabase
    .from("discovery_run_events")
    .select("discovery_run_id")
    .eq("event_id", body.eventId);
  if (runLinksError) {
    return NextResponse.json({ error: runLinksError.message }, { status: 500 });
  }
  const runIds = (runLinks ?? []).map((link) => link.discovery_run_id);
  const { data: ownedRun } = runIds.length
    ? await supabase
        .from("discovery_runs")
        .select("id")
        .eq("profile_id", context.profile.id)
        .eq("run_kind", "customer")
        .in("id", runIds)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (!ownedRun) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  const { data: event, error: fetchError } = await supabase
      .from("events")
      .select("id, event_name, source_url, booking_path")
      .eq("id", body.eventId)
      .single();

  if (fetchError || !event) {
    return NextResponse.json({ error: fetchError?.message ?? "Event not found" }, { status: 404 });
  }

  // Discovery already auto-enriches everything it saves, so the row may
  // already have contacts. Return those for free instead of silently charging
  // a second time for the same lookup; re-running costs credits and needs an
  // explicit `force` from the caller.
  if (!body.force) {
    const { data: ownedContacts, error: linksError } = await supabase
      .from("customer_event_contacts")
      .select("contact_id")
      .eq("profile_id", context.profile.id)
      .eq("event_id", body.eventId);
    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 });
    }
    const contactIds = (ownedContacts ?? []).map((link) => link.contact_id);
    const { data: existing, error: existingError } = contactIds.length
      ? await supabase.from("contacts").select("*").in("id", contactIds)
      : { data: [], error: null };
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existing && existing.length > 0) {
      return NextResponse.json({ inserted: 0, contacts: existing, cached: true });
    }
  }

  let operationKey: string | null = null;
  try {
    const entitlement = await getUsageEntitlement(supabase, context.profile.id);
    operationKey = await requireAndDebitCredits(supabase, {
      profileId: context.user.id,
      amount: CREDIT_COSTS.enrichment,
      reason: "enrichment_usage",
      relatedEventId: body.eventId,
      operationKey: body.operationKey,
      discoveryRunId: ownedRun.id,
    });
    const contacts = await enrichAndSaveContacts(supabase, event, {
      profileId: context.user.id,
      discoveryRunId: ownedRun.id,
      billingMode: entitlement.billingMode,
    });
    await completeCreditOperation(supabase, operationKey);
    return NextResponse.json({
      inserted: contacts.length,
      contacts,
      creditsCharged: entitlement.isOwnerUnlimited ? 0 : CREDIT_COSTS.enrichment,
      billingMode: entitlement.billingMode,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: e.message, code: "insufficient_credits", balance: e.balance, required: e.required },
        { status: 402 }
      );
    }
    if (operationKey) {
      await refundUsageCredits(supabase, { operationKey });
    }
    const message = e instanceof Error ? e.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
