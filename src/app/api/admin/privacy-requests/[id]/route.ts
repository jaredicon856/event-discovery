import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { service, profile: actor } = await requireSuperAdmin();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: string; note?: string };
    if (body.status !== "done" && body.status !== "declined") {
      return NextResponse.json({ error: "Status must be done or declined" }, { status: 400 });
    }
    const note = body.note?.trim().slice(0, 500) || null;

    const { data, error } = await service
      .from("privacy_requests")
      .update({ status: body.status, note, handled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "open")
      .select("id, profile_id, kind")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Request not found or already handled" }, { status: 404 });

    await service.from("admin_audit_log").insert({
      actor_profile_id: actor.id,
      target_profile_id: data.profile_id,
      action: `privacy_request_${body.status}`,
      reason: note ?? `${data.kind} request marked ${body.status}`,
      details: { request_id: data.id, kind: data.kind },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Could not update the request" }, { status: 500 });
  }
}
