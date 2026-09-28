import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { hashInvitationToken } from "@/lib/invitations";
import { sendOwnerNewTrialAlert } from "@/lib/email/notify";

export async function POST(request: NextRequest) {
  const auth = await getSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await request.json()) as { token?: string };
  if (!body.token) return NextResponse.json({ error: "Invitation token required" }, { status: 400 });

  const service = getSupabaseServiceClient();
  const { data: accepted, error } = await service.rpc("accept_invitation", {
    p_profile_id: user.id,
    p_token_hash: hashInvitationToken(body.token),
  });
  if (error || !accepted) {
    return NextResponse.json(
      { error: "This invitation is invalid, expired, revoked, used, or belongs to another email" },
      { status: 403 }
    );
  }
  const { data: activation, error: activationError } = await service.rpc(
    "activate_public_account",
    { p_profile_id: user.id }
  );
  if (
    activationError ||
    !(activation as { activated?: boolean } | null)?.activated
  ) {
    return NextResponse.json({ error: "Account activation failed" }, { status: 403 });
  }
  const trialGranted = (activation as { trial_granted?: boolean }).trial_granted ?? false;
  if (trialGranted) await sendOwnerNewTrialAlert(service, user.id);
  return NextResponse.json({ accepted: true, trialGranted });
}
