if (typeof window !== "undefined") {
  throw new Error("src/lib/access.ts must not be imported from a Client Component module.");
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { IMPERSONATION_COOKIE_NAME, verifyImpersonationToken } from "@/lib/impersonation";

export type AccessStatus = "pending" | "active" | "suspended";
export type AppRole = "user" | "super_admin";

export interface AccessProfile {
  id: string;
  email: string;
  role: AppRole;
  access_status: AccessStatus;
  full_name: string | null;
  display_name: string | null;
  company: string | null;
  job_title: string | null;
  timezone: string;
  avatar_path: string | null;
  profile_updated_at: string;
  password_enabled_at: string | null;
}

export interface AccessContext {
  user: User;
  profile: AccessProfile;
  service: ReturnType<typeof getSupabaseServiceClient>;
  /** Present only when the request is running under a "Login as" impersonation session. */
  impersonation?: { adminProfileId: string; adminEmail: string } | null;
}

const PROFILE_COLUMNS =
  "id, email, role, access_status, full_name, display_name, company, job_title, timezone, avatar_path, profile_updated_at, password_enabled_at";

export class AccessError extends Error {
  constructor(
    public code: "unauthenticated" | "pending" | "suspended" | "forbidden",
    public status: 401 | 403,
    message: string
  ) {
    super(message);
  }
}

/**
 * Resolves the REAL, currently-authenticated Supabase user and profile —
 * never affected by an impersonation cookie. Used both as the base for
 * requireActiveUser (which may then layer impersonation on top) and directly
 * by requireSuperAdmin, which must always reflect the real signed-in user so
 * admin-only routes keep working while an admin is impersonating someone.
 */
async function resolveRealContext(): Promise<AccessContext> {
  const auth = await getSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) {
    throw new AccessError("unauthenticated", 401, "Sign in required");
  }

  const service = getSupabaseServiceClient();
  const { data: profile, error } = await service
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new AccessError("pending", 403, "Verify your identity to activate this account");
  }
  if (profile.access_status === "pending") {
    throw new AccessError("pending", 403, "Email verification is required");
  }
  if (profile.access_status === "suspended") {
    throw new AccessError("suspended", 403, "This account is suspended");
  }

  return { user, profile: profile as AccessProfile, service };
}

export async function requireActiveUser(): Promise<AccessContext> {
  const context = await resolveRealContext();

  // Only a real, currently-active super_admin can be impersonating anyone.
  if (context.profile.role !== "super_admin") {
    return context;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value;
  const payload = verifyImpersonationToken(token);
  if (!payload || payload.adminProfileId !== context.profile.id) {
    return context;
  }

  const { data: target, error } = await context.service
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", payload.targetProfileId)
    .maybeSingle();

  // Any inconsistency (target missing/suspended/pending/promoted to admin
  // since the token was issued) — silently fall back to the real admin.
  if (error || !target || target.access_status !== "active" || target.role === "super_admin") {
    return context;
  }

  return {
    // Everything else in the app keys writes/reads off .user.id, which is
    // always equal to profiles.id — spoof it to the target so all data
    // access transparently acts as the impersonated member.
    user: { ...context.user, id: target.id, email: target.email },
    profile: target as AccessProfile,
    service: context.service,
    impersonation: { adminProfileId: context.profile.id, adminEmail: context.profile.email },
  };
}

/**
 * Always resolves against the REAL underlying user's role, ignoring any
 * impersonation cookie — an impersonation session must never grant
 * super_admin powers, and the admin must always be able to reach admin-only
 * routes (e.g. to stop impersonating) regardless of an active session.
 */
export async function requireSuperAdmin(): Promise<AccessContext> {
  const context = await resolveRealContext();
  if (context.profile.role !== "super_admin") {
    throw new AccessError("forbidden", 403, "Super-admin access required");
  }
  return context;
}

export function accessErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AccessError)) return null;
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}
