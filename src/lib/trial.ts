export const TRIAL_DAYS = 7;

export type TrialEntitlementRow = {
  discovery_remaining: number;
  contact_lookups_remaining: number;
  expires_at: string | null;
};

export interface EffectiveTrial {
  discoveryRemaining: number;
  contactsRemaining: number;
  expiresAt: string | null;
  expired: boolean;
  daysLeft: number | null;
}

/** Remaining trial actions, zeroed once the trial window has passed. */
export function effectiveTrial(
  row: TrialEntitlementRow | null | undefined,
  now: Date = new Date()
): EffectiveTrial | null {
  if (!row) return null;
  const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const expired = expiresMs != null && expiresMs <= now.getTime();
  const daysLeft =
    expiresMs == null || expired
      ? expiresMs == null ? null : 0
      : Math.ceil((expiresMs - now.getTime()) / (1000 * 60 * 60 * 24));
  return {
    discoveryRemaining: expired ? 0 : row.discovery_remaining,
    contactsRemaining: expired ? 0 : row.contact_lookups_remaining,
    expiresAt: row.expires_at,
    expired,
    daysLeft,
  };
}

export function trialDaysLeftLabel(daysLeft: number | null): string {
  if (daysLeft == null) return "";
  if (daysLeft <= 0) return "expired";
  return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
}
