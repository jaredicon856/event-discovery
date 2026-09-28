import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { profile, service } = await requireSuperAdmin();
    const { id } = await params;
    const { data, error } = await service
      .from("invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id, email")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Pending invitation not found" }, { status: 404 });
    }

    await service.from("admin_audit_log").insert({
      actor_profile_id: profile.id,
      action: "invitation_revoked",
      reason: `Revoked invitation for ${data.email}`,
      details: { invitation_id: data.id },
    });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to revoke invitation" },
      { status: 500 }
    );
  }
}
