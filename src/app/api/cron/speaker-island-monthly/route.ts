import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { assertVercelCronAuthorized, UnauthorizedError } from "@/lib/auth";
import { monthlyAllowance } from "@/lib/speakerIsland";

export const maxDuration = 60;

// Tops up every Speaker Island member at the start of each month, so they
// don't have to come through the Portal to get it. Safe to run daily: the
// grant happens once per member per calendar month.
export async function GET(request: NextRequest) {
  try {
    assertVercelCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw e;
  }
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("speaker_island_members")
    .select("profile_id, profiles!inner(access_status)")
    .eq("profiles.access_status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { searches, lookups } = monthlyAllowance();
  let granted = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const { data: ok, error: grantError } = await supabase.rpc("grant_speaker_island_month", {
      p_profile_id: row.profile_id,
      p_searches: searches,
      p_lookups: lookups,
    });
    if (grantError) failed++;
    else if (ok) granted++;
  }
  return NextResponse.json({ ok: true, members: data?.length ?? 0, granted, failed });
}
