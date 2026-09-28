import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";
import { invitationEmail } from "@/lib/email/templates";
import { appOrigin, sendEmail } from "@/lib/email/resend";
import {
  createInvitationToken,
  invitationRedirectUrl,
} from "@/lib/invitations";

export async function GET() {
  try {
    const { service } = await requireSuperAdmin();
    const { data, error } = await service
      .from("invitations")
      .select("id, email, status, expires_at, accepted_at, revoked_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ invitations: data ?? [] });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invitations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profile, service } = await requireSuperAdmin();
    const body = (await request.json()) as { email?: string; expiresHours?: number };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    }

    const expiresHours = Math.min(168, Math.max(1, body.expiresHours ?? 72));
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();
    const { token, tokenHash } = createInvitationToken();

    const { data: invitation, error: insertError } = await service
      .from("invitations")
      .insert({
        email,
        token_hash: tokenHash,
        invited_by: profile.id,
        expires_at: expiresAt,
      })
      .select("id, email, status, expires_at, created_at")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "A pending invitation already exists" }, { status: 409 });
      }
      throw new Error(insertError.message);
    }

    const origin = appOrigin(request.nextUrl.origin);
    const callbackUrl = invitationRedirectUrl(origin, token);
    const acceptUrl = new URL("/login", origin);
    acceptUrl.searchParams.set("invite", token);

    // Create the auth invite without Supabase sending its own email, then deliver
    // our branded Resend message with the action link.
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: callbackUrl },
    });

    let delivery: "resend" | "manual_required" = "manual_required";
    let deliveryWarning: string | undefined;
    const actionLink = linkData?.properties?.action_link;

    if (linkError || !actionLink) {
      deliveryWarning =
        "Invitation created, but the auth invite link could not be generated. Copy the secure acceptance link.";
    } else {
      try {
        const template = invitationEmail({
          toEmail: email,
          acceptUrl: actionLink,
          expiresAt,
        });
        await sendEmail({
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          tags: [
            { name: "category", value: "invitation" },
            { name: "invitation_id", value: invitation.id },
          ],
        });
        delivery = "resend";
      } catch (sendError) {
        deliveryWarning =
          sendError instanceof Error
            ? `Invitation created, but Resend could not send it (${sendError.message}). Copy the secure acceptance link.`
            : "Invitation created, but Resend could not send it. Copy the secure acceptance link.";
      }
    }

    await service.from("admin_audit_log").insert({
      actor_profile_id: profile.id,
      action: "invitation_created",
      reason: `Invited ${email}`,
      details: {
        invitation_id: invitation.id,
        expires_at: expiresAt,
        delivery,
      },
    });

    return NextResponse.json({
      invitation,
      acceptUrl: acceptUrl.toString(),
      emailSent: delivery === "resend",
      deliveryWarning,
    });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invitation" },
      { status: 500 }
    );
  }
}
