import { NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { appOrigin, ownerAlertEmail, sendEmail } from "@/lib/email/resend";
import { privacyRequestConfirmationEmail, privacyRequestOwnerEmail } from "@/lib/email/templates";

export async function POST() {
  try {
    const { profile, service, impersonation } = await requireActiveUser();
    if (impersonation) {
      return NextResponse.json({ error: "Not available while viewing as a customer" }, { status: 403 });
    }
    if (profile.role === "super_admin") {
      return NextResponse.json({ error: "Owner accounts cannot be deleted here" }, { status: 403 });
    }

    const { data: existing } = await service
      .from("privacy_requests")
      .select("id, created_at")
      .eq("profile_id", profile.id)
      .eq("kind", "delete")
      .eq("status", "open")
      .maybeSingle();
    if (existing) return NextResponse.json({ requested: true, createdAt: existing.created_at, duplicate: true });

    const { data: created, error } = await service
      .from("privacy_requests")
      .insert({ profile_id: profile.id, email: profile.email, kind: "delete" })
      .select("created_at")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not save the request");

    try {
      const owner = privacyRequestOwnerEmail({
        customerEmail: profile.email,
        customerName: profile.full_name,
        requestedAt: created.created_at,
        adminUrl: `${appOrigin()}/admin`,
      });
      await sendEmail({ to: ownerAlertEmail(), replyTo: profile.email, ...owner, tags: [{ name: "category", value: "privacy_request" }] });
      const confirmation = privacyRequestConfirmationEmail();
      await sendEmail({ to: profile.email, ...confirmation, tags: [{ name: "category", value: "privacy_request_confirmation" }] });
    } catch (mailError) {
      console.error("privacy request email", mailError);
    }
    return NextResponse.json({ requested: true, createdAt: created.created_at });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Could not submit your request" }, { status: 500 });
  }
}
