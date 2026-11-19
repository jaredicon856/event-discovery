if (typeof window !== "undefined") {
  throw new Error("src/lib/email/unsubscribe.ts must not be imported from a Client Component module.");
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/email/resend";

function key(): string | null {
  const secret = process.env.UNSUBSCRIBE_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

function sign(profileId: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsubscribe:${profileId}`).digest("base64url");
}

export function signUnsubscribeToken(profileId: string, secret = key()): string | null {
  if (!secret) return null;
  return `${profileId}.${sign(profileId, secret)}`;
}

/** The profile id if the token is genuine, otherwise null. */
export function verifyUnsubscribeToken(token: string | null | undefined, secret = key()): string | null {
  if (!secret || !token) return null;
  const [profileId, signature, extra] = token.split(".");
  if (!profileId || !signature || extra !== undefined) return null;
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const want = Buffer.from(sign(profileId, secret));
  const got = Buffer.from(signature);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return profileId;
}

/** Link and mail headers for one-click unsubscribe, or null when no signing secret is configured. */
export function unsubscribeFor(profileId: string, origin?: string): { url: string; headers: Record<string, string> } | null {
  const token = signUnsubscribeToken(profileId);
  if (!token) return null;
  const base = appOrigin(origin);
  const url = `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
  const oneClick = `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    url,
    headers: {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
