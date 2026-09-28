import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ACCOUNT_TIMEZONE } from "@/lib/timezone";
import { composeFullName, isProfileComplete } from "@/lib/profileCompletion";

const PROFILE_SELECT =
  "full_name, display_name, company, job_title, timezone, avatar_path, profile_updated_at";

export async function GET() {
  try {
    const { profile, service } = await requireActiveUser();
    const { data: avatar } = profile.avatar_path
      ? await service.storage.from("profile-photos").createSignedUrl(profile.avatar_path, 60 * 60)
      : { data: null };
    return NextResponse.json({
      profile,
      avatarUrl: avatar?.signedUrl ?? null,
    });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const allowed = new Set(["fullName", "displayName", "company", "jobTitle", "timezone", "firstName", "lastName", "completeProfile"]);
  const rejected = Object.keys(body).filter((key) => !allowed.has(key));
  if (rejected.length) {
    return NextResponse.json({ error: `Profile field is not editable: ${rejected[0]}` }, { status: 400 });
  }
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (key === "completeProfile") {
      if (typeof body[key] !== "boolean") {
        return NextResponse.json({ error: "completeProfile must be true or false" }, { status: 400 });
      }
      continue;
    }
    if (typeof body[key] !== "string") {
      return NextResponse.json({ error: `${key} must be text` }, { status: 400 });
    }
  }

  const completing = body.completeProfile === true;
  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const composedName = composeFullName(firstName, lastName);
  const fullName = composedName || (typeof body.fullName === "string" ? body.fullName : context.profile.full_name);
  if (completing && !isProfileComplete({ full_name: fullName })) {
    return NextResponse.json({ error: "First name and last name are required." }, { status: 400 });
  }

  const auth = await getSupabaseServerClient();
  const { data, error } = await auth.rpc("update_own_profile", {
    p_full_name: fullName,
    p_display_name: (body.displayName as string | undefined) ?? context.profile.display_name,
    p_company: (body.company as string | undefined) ?? context.profile.company,
    p_job_title: (body.jobTitle as string | undefined) ?? context.profile.job_title,
    p_timezone: ACCOUNT_TIMEZONE,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile) {
    const { data: fallback } = await context.service
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", context.profile.id)
      .single();
    return NextResponse.json({ profile: fallback });
  }
  return NextResponse.json({ profile });
}
