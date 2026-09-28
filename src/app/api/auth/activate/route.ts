import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { sendOwnerNewTrialAlert } from "@/lib/email/notify";

export async function POST() {
  const auth = await getSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const service = getSupabaseServiceClient();
  const { data, error } = await service.rpc("activate_public_account", {
    p_profile_id: user.id,
  });
  const activation = data as {
    activated?: boolean;
    trial_granted?: boolean;
    reason?: string;
  } | null;
  if (error || !activation?.activated) {
    return NextResponse.json(
      {
        error: activation?.reason === "suspended"
          ? "This account is suspended"
          : "Verify your email before continuing",
      },
      { status: 403 }
    );
  }
  if (activation.trial_granted) await sendOwnerNewTrialAlert(service, user.id);
  return NextResponse.json({
    active: true,
    trialGranted: activation.trial_granted ?? false,
  });
}
