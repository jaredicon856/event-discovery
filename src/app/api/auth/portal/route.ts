import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { isProfileComplete, splitPersonName } from "@/lib/profileCompletion";
import { monthlyAllowance, verifyPortalToken } from "@/lib/speakerIsland";
import { appOrigin, sendEmail } from "@/lib/email/resend";
import { speakerIslandWelcomeEmail } from "@/lib/email/templates";

// Sign-in from the Speaker Island Portal's Marketplace. The Portal has already
// verified the member's email; this links (or creates) their Event Scout
// account, tops up the month's free searches, and starts a session.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, origin));

  const payload = verifyPortalToken(searchParams.get("token"));
  if (!payload) return fail("portal_link");

  const service = getSupabaseServiceClient();
  // Each link works once.
  const { error: nonceError } = await service.from("portal_sso_nonces").insert({ nonce: payload.nonce });
  if (nonceError) return fail("portal_link");

  let { data: profile } = await service
    .from("profiles")
    .select("id, role, access_status, full_name")
    // ilike for case, with its wildcards escaped: "_" is common in addresses.
    .ilike("email", payload.email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .maybeSingle();

  // Owners sign in the normal way, never through the Portal.
  if (profile?.role === "super_admin") return fail("portal_owner");
  if (profile?.access_status === "suspended") {
    return NextResponse.redirect(new URL("/login?access=suspended", origin));
  }

  if (!profile) {
    const { firstName, lastName } = splitPersonName(payload.name);
    const { data: created, error } = await service.auth.admin.createUser({
      email: payload.email,
      email_confirm: true,
      user_metadata: { full_name: payload.name, given_name: firstName, family_name: lastName, source: "speaker_island" },
    });
    if (error || !created.user) return fail("auth_callback");
    const { data: fresh } = await service
      .from("profiles")
      .select("id, role, access_status, full_name")
      .eq("id", created.user.id)
      .maybeSingle();
    profile = fresh;
    if (!profile) return fail("auth_callback");
  } else {
    // The Portal proved this address, so confirm it here too if it wasn't yet.
    await service.auth.admin.updateUserById(profile.id, { email_confirm: true });
  }

  const { data: activation } = await service.rpc("activate_public_account", { p_profile_id: profile.id });
  if (!(activation as { activated?: boolean } | null)?.activated) return fail("verification_required");

  if (!isProfileComplete(profile) && isProfileComplete({ full_name: payload.name })) {
    await service.from("profiles").update({ full_name: payload.name }).eq("id", profile.id);
    profile.full_name = payload.name;
  }

  const { data: wasMember } = await service.from("speaker_island_members").select("profile_id").eq("profile_id", profile.id).maybeSingle();
  const { error: memberError } = await service
    .from("speaker_island_members")
    .upsert({ profile_id: profile.id, member_type: payload.memberType, last_seen_at: new Date().toISOString() }, { onConflict: "profile_id" });
  if (memberError) return fail("auth_callback");
  const { searches, lookups } = monthlyAllowance();
  const { error: grantError } = await service.rpc("grant_speaker_island_month", {
    p_profile_id: profile.id,
    p_searches: searches,
    p_lookups: lookups,
  });
  if (grantError) console.error("speaker island grant", grantError.message);

  // One welcome email, the first time a member comes through.
  if (!wasMember && !grantError) {
    try {
      const mail = speakerIslandWelcomeEmail({
        firstName: splitPersonName(payload.name).firstName,
        searches,
        searchUrl: `${appOrigin(origin)}/opportunities?tab=new`,
      });
      await sendEmail({ to: payload.email, ...mail, tags: [{ name: "category", value: "speaker_island_welcome" }] });
    } catch (e) {
      console.error("speaker island welcome email", e);
    }
  }

  // A one-time magic link token, redeemed here on the server, sets the session cookies.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: payload.email });
  if (linkError || !link.properties?.hashed_token) return fail("auth_callback");
  const supabase = await getSupabaseServerClient();
  const { error: otpError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpError) return fail("auth_callback");

  return NextResponse.redirect(new URL(isProfileComplete(profile) ? "/opportunities" : "/onboarding", origin));
}
