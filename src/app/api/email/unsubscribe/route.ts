import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { getSupabaseServiceClient } from "@/lib/supabase";

// Handles both the page's confirm button and mail clients' one-click unsubscribe (RFC 8058).
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const profileId = verifyUnsubscribeToken(token);
  if (!profileId) return NextResponse.json({ error: "Invalid link" }, { status: 400 });

  const { error } = await getSupabaseServiceClient()
    .from("profiles")
    .update({ email_opt_out_at: new Date().toISOString() })
    .eq("id", profileId)
    .is("email_opt_out_at", null);
  if (error) return NextResponse.json({ error: "Could not unsubscribe" }, { status: 500 });

  const form = await request.formData().catch(() => null);
  if (form?.get("redirect") === "1") {
    return NextResponse.redirect(new URL("/unsubscribe?done=1", request.url), 303);
  }
  return NextResponse.json({ ok: true });
}
