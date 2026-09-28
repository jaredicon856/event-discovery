import { NextRequest, NextResponse } from "next/server";
import { processQueuedDiscoveryJobs } from "@/lib/discovery";
import { assertVercelCronAuthorized, UnauthorizedError } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    assertVercelCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  const supabase = getSupabaseServiceClient();
  const processed = await processQueuedDiscoveryJobs(supabase, 3);
  return NextResponse.json({ processed });
}
