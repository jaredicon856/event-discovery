import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { featureDisabledResponse } from "@/lib/featureFlags";
import { claimAndProcessDiscoveryRun, enqueueDiscovery } from "@/lib/discovery";
import { InsufficientCreditsError } from "@/lib/credits";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { parseCriteria } from "@/lib/searchCriteria";

export const maxDuration = 300;

interface DiscoverBody {
  sector?: string;
  query?: string;
  sectors?: string[];
  location?: string;
  dateFrom?: string;
  dateTo?: string;
  types?: string[];
  expertise?: string;
  audience?: string;
  customQuery?: string;
  maxAutoContactLookups?: number;
  operationKey?: string;
}

export async function POST(request: NextRequest) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const disabled = await featureDisabledResponse(context.service, "discovery", context.profile.id);
  if (disabled) return disabled;

  let body: DiscoverBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const criteria = parseCriteria(body);
  const sector = body.sector?.trim() || criteria.sectors[0] || "";
  const query = body.query?.trim() || body.customQuery?.trim() || "";
  if (!sector || !query) {
    return NextResponse.json({ error: "sector and query are required" }, { status: 400 });
  }
  if (
    body.maxAutoContactLookups !== undefined &&
    (!Number.isInteger(body.maxAutoContactLookups) ||
      body.maxAutoContactLookups < 0 ||
      body.maxAutoContactLookups > 10)
  ) {
    return NextResponse.json(
      { error: "maxAutoContactLookups must be an integer from 0 to 10 per search" },
      { status: 400 }
    );
  }
  if (body.operationKey && body.operationKey.length > 200) {
    return NextResponse.json({ error: "operationKey is too long" }, { status: 400 });
  }

  try {
    const queued = await enqueueDiscovery(context.service, {
      sector,
      query,
      profileId: context.user.id,
      maxAutoContactLookups: body.maxAutoContactLookups,
      operationKey: body.operationKey,
      criteria: { ...criteria, sectors: criteria.sectors.length ? criteria.sectors : [sector], customQuery: query },
    });
    const runId = queued.runId;
    const deferForRecoveryTest =
      process.env.NODE_ENV === "development" &&
      context.profile.role === "super_admin" &&
      request.headers.get("x-recovery-test") === "queue-only";
    if (!deferForRecoveryTest) {
      after(async () => {
        try {
          await claimAndProcessDiscoveryRun(getSupabaseServiceClient(), runId);
        } catch (error) {
          console.error("Discovery processing failed", runId, error);
        }
      });
    }
    return NextResponse.json({
      runId,
      status: "queued",
      billingMode: queued.billingMode,
      duplicate: queued.duplicate ?? false,
    });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: e.message, code: "insufficient_credits", balance: e.balance, required: e.required },
        { status: 402 }
      );
    }
    const message = e instanceof Error ? e.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  const { data, error } = await context.service
    .from("discovery_runs")
    .select(
      "id, sector, query, status, current_stage, last_completed_stage, stage_summaries, events_found, related_count, contacts_found, contact_lookups_failed, credits_charged, credits_refunded, billing_mode, error_message, failure_class, estimated_cost_usd, budget_overrun, extraction_truncated, created_at, completed_at, criteria"
    )
    .eq("id", runId)
    .eq("profile_id", context.user.id)
    .eq("run_kind", "customer")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
