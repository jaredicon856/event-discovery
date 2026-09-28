if (typeof window !== "undefined") {
  throw new Error("src/lib/featureFlags.ts must not be imported from a Client Component module.");
}

import { NextResponse } from "next/server";
import type { getSupabaseServiceClient } from "@/lib/supabase";

export const FEATURE_FLAG_KEYS = [
  "discovery",
  "enrichment",
  "pdf_export",
  "scheduling",
  "saved_lists",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/**
 * Profile-scoped override wins, then the global row, then defaults to
 * enabled so nothing breaks before any flags are configured.
 */
export async function isToolEnabled(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  key: FeatureFlagKey,
  profileId: string
): Promise<boolean> {
  const { data: profileRow } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .eq("scope", "profile")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (profileRow) return profileRow.enabled;

  const { data: globalRow } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .eq("scope", "global")
    .is("profile_id", null)
    .maybeSingle();
  if (globalRow) return globalRow.enabled;

  return true;
}

export async function featureDisabledResponse(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  key: FeatureFlagKey,
  profileId: string
) {
  if (await isToolEnabled(supabase, key, profileId)) return null;
  return NextResponse.json({ error: "This feature is currently disabled" }, { status: 403 });
}
