import type { SupabaseClient } from "@supabase/supabase-js";
import { appOrigin, sendEmail } from "@/lib/email/resend";
import { trialEndingSoonEmail, trialExpiredEmail } from "@/lib/email/templates";
import { formatAccountDate } from "@/lib/timezone";

export const TRIAL_REMINDER_DAYS_BEFORE = 2;
/** Trials that expired longer ago than this never get a late "ended" email. */
export const TRIAL_EXPIRED_NOTICE_WINDOW_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

type Kind = "ending" | "expired";

type TrialRow = {
  profile_id: string;
  expires_at: string;
  profiles: { email: string | null; role: string; access_status: string } | null;
};

const SENT_COLUMN: Record<Kind, "ending_reminder_sent_at" | "expired_notice_sent_at"> = {
  ending: "ending_reminder_sent_at",
  expired: "expired_notice_sent_at",
};

export async function findDueTrials(supabase: SupabaseClient, kind: Kind, now: Date): Promise<TrialRow[]> {
  let query = supabase
    .from("trial_entitlements")
    .select("profile_id, expires_at, profiles!inner(email, role, access_status)")
    .gt("discovery_remaining", 0)
    .is(SENT_COLUMN[kind], null)
    .eq("profiles.access_status", "active")
    .neq("profiles.role", "super_admin");
  query =
    kind === "ending"
      ? query
          .gt("expires_at", now.toISOString())
          .lte("expires_at", new Date(now.getTime() + TRIAL_REMINDER_DAYS_BEFORE * DAY_MS).toISOString())
      : query
          .lte("expires_at", now.toISOString())
          .gt("expires_at", new Date(now.getTime() - TRIAL_EXPIRED_NOTICE_WINDOW_DAYS * DAY_MS).toISOString());
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as TrialRow[];
  if (rows.length === 0) return rows;

  const { data: paid, error: paidError } = await supabase
    .from("subscriptions")
    .select("profile_id")
    .in("profile_id", rows.map((row) => row.profile_id))
    .in("status", ["active", "past_due"]);
  if (paidError) throw new Error(paidError.message);
  const paidIds = new Set((paid ?? []).map((row) => row.profile_id as string));
  return rows.filter((row) => !paidIds.has(row.profile_id) && row.profiles?.email?.includes("@"));
}

async function sendOne(supabase: SupabaseClient, kind: Kind, row: TrialRow): Promise<boolean> {
  const column = SENT_COLUMN[kind];
  const { data: claimed, error } = await supabase
    .from("trial_entitlements")
    .update({ [column]: new Date().toISOString() })
    .eq("profile_id", row.profile_id)
    .is(column, null)
    .select("profile_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) return false;

  const template =
    kind === "ending"
      ? trialEndingSoonEmail({
          searchUrl: `${appOrigin()}/opportunities?tab=new`,
          endsOnLabel: formatAccountDate(row.expires_at),
        })
      : trialExpiredEmail({ billingUrl: `${appOrigin()}/billing#plans` });
  try {
    await sendEmail({
      to: row.profiles!.email!.trim().toLowerCase(),
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags: [
        { name: "category", value: kind === "ending" ? "trial_ending" : "trial_expired" },
        { name: "profile", value: row.profile_id.replace(/-/g, "") },
      ],
    });
    return true;
  } catch (sendError) {
    await supabase
      .from("trial_entitlements")
      .update({ [column]: null })
      .eq("profile_id", row.profile_id);
    throw sendError;
  }
}

export async function sendDueTrialEmails(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<{ endingSent: number; expiredSent: number; failed: number }> {
  const result = { endingSent: 0, expiredSent: 0, failed: 0 };
  for (const kind of ["ending", "expired"] as const) {
    for (const row of await findDueTrials(supabase, kind, now)) {
      try {
        if (await sendOne(supabase, kind, row)) {
          if (kind === "ending") result.endingSent += 1;
          else result.expiredSent += 1;
        }
      } catch {
        result.failed += 1;
      }
    }
  }
  return result;
}
