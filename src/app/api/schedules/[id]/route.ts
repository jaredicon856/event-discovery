import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { featureDisabledResponse } from "@/lib/featureFlags";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const { id } = await params;
  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });
  }
  if (body.enabled) {
    const disabled = await featureDisabledResponse(context.service, "scheduling", context.profile.id);
    if (disabled) return disabled;
  }

  const { data, error } = await context.service
    .from("discovery_schedules")
    .update({ enabled: body.enabled })
    .eq("id", id)
    .eq("profile_id", context.profile.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const { id } = await params;
  const { error } = await context.service
    .from("discovery_schedules")
    .delete()
    .eq("id", id)
    .eq("profile_id", context.profile.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
