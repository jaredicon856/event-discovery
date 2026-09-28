import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";

export async function POST(request: NextRequest) {
  try {
    const { profile, service } = await requireSuperAdmin();
    const body = (await request.json()) as {
      profileId?: string;
      amount?: number;
      reason?: string;
    };
    const amount = Number(body.amount);
    const reason = body.reason?.trim();
    if (!body.profileId || !Number.isInteger(amount) || amount === 0 || !reason || reason.length < 3) {
      return NextResponse.json(
        { error: "Member, non-zero whole-credit amount, and reason are required" },
        { status: 400 }
      );
    }
    const { data, error } = await service.rpc("admin_adjust_manual_credits", {
      p_actor_profile_id: profile.id,
      p_target_profile_id: body.profileId,
      p_amount: amount,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ adjusted: true, ledgerId: data });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Credit adjustment failed" },
      { status: 500 }
    );
  }
}
