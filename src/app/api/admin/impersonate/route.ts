import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_MS,
  signImpersonationToken,
  verifyImpersonationToken,
} from "@/lib/impersonation";

/**
 * Starts an impersonation session: a super_admin can view/act as another
 * (non-admin) member for support/debugging. This never swaps Supabase auth —
 * it layers a short-lived, signed, httpOnly cookie on top of the admin's own
 * session; see src/lib/impersonation.ts and requireActiveUser() in access.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const { profile: actor, service } = await requireSuperAdmin();

    let body: { targetProfileId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const targetProfileId = body.targetProfileId?.trim();
    if (!targetProfileId) {
      return NextResponse.json({ error: "targetProfileId is required" }, { status: 400 });
    }
    if (targetProfileId === actor.id) {
      return NextResponse.json({ error: "You cannot impersonate yourself" }, { status: 400 });
    }

    const { data: target, error } = await service
      .from("profiles")
      .select("id, email, role, access_status")
      .eq("id", targetProfileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!target) {
      return NextResponse.json({ error: "Target member not found" }, { status: 404 });
    }
    if (target.role === "super_admin") {
      return NextResponse.json({ error: "You cannot impersonate another owner" }, { status: 400 });
    }

    let token: string;
    try {
      token = signImpersonationToken({ adminProfileId: actor.id, targetProfileId: target.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("IMPERSONATION_SECRET")) {
        return NextResponse.json(
          { error: "Login-as is not configured. Set IMPERSONATION_SECRET on the server." },
          { status: 503 }
        );
      }
      throw error;
    }

    await service.from("admin_audit_log").insert({
      actor_profile_id: actor.id,
      target_profile_id: target.id,
      action: "impersonation_start",
      reason: `Owner ${actor.email} started viewing as ${target.email}`,
      details: { target_email: target.email },
    });

    const response = NextResponse.json({ target: { id: target.id, email: target.email } });
    response.cookies.set(IMPERSONATION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(IMPERSONATION_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start impersonation" },
      { status: 500 }
    );
  }
}

/**
 * Ends impersonation. Uses the REAL underlying super_admin (requireSuperAdmin
 * resolves against the real session for admin-only routes) so this always
 * works even if the impersonation cookie is stale/expired/tampered.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { profile: actor, service } = await requireSuperAdmin();

    const cookieToken = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value;
    const payload = verifyImpersonationToken(cookieToken);

    await service.from("admin_audit_log").insert({
      actor_profile_id: actor.id,
      target_profile_id: payload?.targetProfileId ?? null,
      action: "impersonation_stop",
      reason: `Owner ${actor.email} returned to admin`,
      details: {},
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to stop impersonation" },
      { status: 500 }
    );
  }
}
