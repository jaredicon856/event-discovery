import { NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { buildDataExport } from "@/lib/privacyRequests";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile, service, impersonation } = await requireActiveUser();
    if (impersonation) {
      return NextResponse.json({ error: "Not available while viewing as a customer" }, { status: 403 });
    }
    const data = await buildDataExport(service, profile);
    await service.from("privacy_requests").insert({
      profile_id: profile.id,
      email: profile.email,
      kind: "export",
      status: "done",
      handled_at: new Date().toISOString(),
    });
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="event-scout-my-data.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Could not build your export" }, { status: 500 });
  }
}
