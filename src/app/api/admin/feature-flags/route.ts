import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";
import { FEATURE_FLAG_KEYS, type FeatureFlagKey } from "@/lib/featureFlags";

export async function GET() {
  try {
    const { service } = await requireSuperAdmin();
    const { data, error } = await service
      .from("feature_flags")
      .select("id, key, scope, profile_id, enabled, updated_at")
      .eq("scope", "global")
      .order("key", { ascending: true });
    if (error) throw new Error(error.message);

    const byKey = new Map(data?.map((row) => [row.key, row]));
    const flags = FEATURE_FLAG_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        key,
        enabled: row?.enabled ?? true,
        updated_at: row?.updated_at ?? null,
      };
    });
    return NextResponse.json({ flags });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load feature flags" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profile: actor, service } = await requireSuperAdmin();
    const body = (await request.json().catch(() => null)) as
      | { key?: string; enabled?: boolean; reason?: string }
      | null;
    const key = body?.key;
    const enabled = body?.enabled;
    const reason = body?.reason?.trim();

    if (!key || !FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey)) {
      return NextResponse.json({ error: "A valid feature key is required" }, { status: 400 });
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    if (!reason || reason.length < 3) {
      return NextResponse.json({ error: "A reason is required" }, { status: 400 });
    }

    const { data: existing, error: lookupError } = await service
      .from("feature_flags")
      .select("id")
      .eq("key", key)
      .eq("scope", "global")
      .is("profile_id", null)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    const { data, error } = existing
      ? await service
          .from("feature_flags")
          .update({ enabled, updated_by: actor.id, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("key, enabled, updated_at")
          .single()
      : await service
          .from("feature_flags")
          .insert({
            key,
            scope: "global",
            profile_id: null,
            enabled,
            updated_by: actor.id,
            updated_at: new Date().toISOString(),
          })
          .select("key, enabled, updated_at")
          .single();
    if (error) throw new Error(error.message);

    await service.from("admin_audit_log").insert({
      actor_profile_id: actor.id,
      target_profile_id: null,
      action: "feature_flag_change",
      reason,
      details: { key, scope: "global", enabled },
    });

    return NextResponse.json({ flag: data });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update feature flag" },
      { status: 500 }
    );
  }
}
