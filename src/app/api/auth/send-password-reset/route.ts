import { NextRequest, NextResponse } from "next/server";
import { resetPasswordEmail } from "@/lib/email/templates";
import { appOrigin, sendEmail } from "@/lib/email/resend";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  let body: { email?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true });
  }

  const nextPath =
    typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")
      ? body.next
      : "/reset-password";

  try {
    const origin = appOrigin(request.nextUrl.origin);
    const redirectTo = new URL("/auth/callback", origin);
    redirectTo.searchParams.set("next", nextPath);

    const service = getSupabaseServiceClient();
    const { data, error } = await service.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: redirectTo.toString() },
    });

    const actionLink = data?.properties?.action_link;
    if (error || !actionLink) {
      return NextResponse.json({ ok: true });
    }

    const template = resetPasswordEmail({ resetUrl: actionLink });
    await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [{ name: "category", value: "password_reset" }],
    });
  } catch {
    // Non-enumerating — always look successful to the client.
  }

  return NextResponse.json({ ok: true });
}
