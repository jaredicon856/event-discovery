import { NextRequest, NextResponse } from "next/server";
import { accessRequestAlertEmail } from "@/lib/email/templates";
import { ownerAlertEmail, sendEmail } from "@/lib/email/resend";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  let body: { email?: string; name?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const name = body.name?.trim().slice(0, 120) || null;
  const message = body.message?.trim().slice(0, 1000) || null;

  const service = getSupabaseServiceClient();
  const { error } = await service.from("access_requests").insert({
    email,
    name,
    message,
  });

  // Keep the public response intentionally non-enumerating.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Could not submit the request" }, { status: 500 });
  }

  // Only alert on a fresh insert (skip duplicate email noise).
  if (!error) {
    try {
      const template = accessRequestAlertEmail({
        requesterEmail: email,
        requesterName: name,
        message,
      });
      await sendEmail({
        to: ownerAlertEmail(),
        replyTo: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        tags: [{ name: "category", value: "access_request" }],
      });
    } catch {
      // Request is stored; owner can still review in Admin. Don't fail the public form.
    }
  }

  return NextResponse.json({
    submitted: true,
    message: "If this address is eligible, the Event Scout owner will send an invitation.",
  });
}
