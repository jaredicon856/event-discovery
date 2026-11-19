if (typeof window !== "undefined") {
  throw new Error("src/lib/consent.ts must not be imported from a Client Component module.");
}

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { LEGAL_VERSION } from "@/lib/legal";

export type ConsentSource = "signup" | "gate";

export async function hasAcceptedCurrentTerms(service: SupabaseClient, profileId: string): Promise<boolean> {
  const { data, error } = await service
    .from("legal_consents")
    .select("id")
    .eq("profile_id", profileId)
    .eq("version", LEGAL_VERSION)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function recordConsent(service: SupabaseClient, profileId: string, source: ConsentSource): Promise<void> {
  const { error } = await service.from("legal_consents").insert({
    profile_id: profileId,
    version: LEGAL_VERSION,
    source,
  });
  if (error) throw new Error(error.message);
}

/**
 * True when this person has accepted the current terms. A box ticked on the signup form is carried
 * in their sign-in metadata, and is turned into a consent record here the first time they arrive.
 */
export async function ensureTermsAccepted(service: SupabaseClient, user: User, profileId: string): Promise<boolean> {
  if (await hasAcceptedCurrentTerms(service, profileId)) return true;
  if (user.user_metadata?.terms_version === LEGAL_VERSION) {
    await recordConsent(service, profileId, "signup");
    return true;
  }
  return false;
}
