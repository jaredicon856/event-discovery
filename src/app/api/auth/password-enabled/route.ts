import { NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";

export async function POST() {
  try {
    const { profile, service } = await requireActiveUser();
    const { error } = await service
      .from("profiles")
      .update({ password_enabled_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ passwordEnabled: true });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Could not update password status" }, { status: 500 });
  }
}
