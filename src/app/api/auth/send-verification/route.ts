import { NextRequest, NextResponse } from "next/server";
import { confirmEmailEmail } from "@/lib/email/templates";
import { appOrigin, sendEmail } from "@/lib/email/resend";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const email = body.email?.trim().toLowerCase();
  // Non-enumerating response whether or not delivery succeeds.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  try {
    const origin = appOrigin(request.nextUrl.origin);
    const redirectTo = new URL("/auth/callback", origin);
    redirectTo.searchParams.set("next", "/onboarding");

    const service = getSupabaseServiceClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: redirectTo.toString() },
    });

    const actionLink = data?.properties?.action_link;
    if (error || !actionLink) {
      return NextResponse.json({ ok: true });
    }

    const template = confirmEmailEmail({
      confirmUrl: actionLink,
    });
    await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "category", value: "confirm_email" }],
    });
  } catch {
    // Swallow — client already shows the check-inbox message.
  }

  return NextResponse.json({ ok: true });
}
