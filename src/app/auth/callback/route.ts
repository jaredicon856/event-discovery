import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { hashInvitationToken } from "@/lib/invitations";
import { isProfileComplete } from "@/lib/profileCompletion";
import { sendOwnerNewTrialAlert } from "@/lib/email/notify";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";
  const inviteToken = searchParams.get("invite");

  if (!code) {
    // Admin-generated Supabase invite/recovery links can use the implicit
    // flow and place session tokens in the URL fragment (which never reaches
    // the server). Preserve that fragment through a redirect so the login
    // client can establish the session and finish app-invitation acceptance.
    if (inviteToken) {
      const implicit = new URL("/login", origin);
      implicit.searchParams.set("invite", inviteToken);
      implicit.searchParams.set("accept_hash", "1");
      if (next !== "/") implicit.searchParams.set("next", next);
      return NextResponse.redirect(implicit);
    }
    const implicit = new URL("/login", origin);
    implicit.searchParams.set(next === "/onboarding" ? "activate_hash" : "session_hash", "1");
    implicit.searchParams.set("next", next);
    return NextResponse.redirect(implicit);
  }

  const supabase = await getSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
  }

  const service = getSupabaseServiceClient();
  if (inviteToken) {
    const { data: accepted, error } = await service.rpc("accept_invitation", {
      p_profile_id: user.id,
      p_token_hash: hashInvitationToken(inviteToken),
    });
    if (error || !accepted) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=invalid_invitation", origin));
    }
  }

  const { data: activation, error: activationError } = await service.rpc(
    "activate_public_account",
    { p_profile_id: user.id }
  );
  if (
    activationError ||
    !(activation as { activated?: boolean } | null)?.activated
  ) {
    await supabase.auth.signOut();
    const reason = (activation as { reason?: string } | null)?.reason;
    return NextResponse.redirect(
      new URL(reason === "suspended" ? "/login?access=suspended" : "/login?error=verification_required", origin)
    );
  }
  if ((activation as { trial_granted?: boolean }).trial_granted) {
    await sendOwnerNewTrialAlert(service, user.id);
  }

  const { data: profile } = await service
    .from("profiles")
    .select("access_status, full_name")
    .eq("id", user.id)
    .single();
  if (profile?.access_status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=invitation_required", origin));
  }

  const destination = isProfileComplete(profile) ? next : "/onboarding";
  return NextResponse.redirect(new URL(destination, origin));
}
