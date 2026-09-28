import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function GET() {
  const auth = await getSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const service = getSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role, access_status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.access_status !== "active") {
    return NextResponse.json(
      {
        error: profile?.access_status === "suspended"
          ? "This account is suspended"
          : "An accepted invitation is required",
        code: profile?.access_status ?? "pending",
      },
      { status: 403 }
    );
  }
  return NextResponse.json({ active: true, role: profile.role });
}
