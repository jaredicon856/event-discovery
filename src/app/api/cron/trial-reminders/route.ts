import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { assertVercelCronAuthorized, UnauthorizedError } from "@/lib/auth";
import { sendDueTrialEmails } from "@/lib/trialReminders";

export const maxDuration = 60;

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
  const result = await sendDueTrialEmails(supabase);
  return NextResponse.json({ ok: true, ...result });
}
