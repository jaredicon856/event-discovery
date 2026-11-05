if (typeof window !== "undefined") {
  throw new Error("src/lib/speakerIsland.ts must not be imported from a Client Component module.");
}

import { createHmac, timingSafeEqual } from "node:crypto";

// Speaker Island Portal members (cast and community) open Event Scout from the
// Portal's Marketplace. The Portal signs a short-lived link with a secret both
// apps share (SPEAKER_ISLAND_SSO_SECRET); Event Scout verifies it, signs the
// member in and tops up their monthly allowance of free searches.

export type MemberType = "cast" | "community";

export interface PortalSsoPayload {
  email: string;
  name: string;
  memberType: MemberType;
  exp: number; // ms since epoch
  nonce: string;
}

/** Links older than this are refused, whatever exp they carry. */
export const MAX_LINK_AGE_MS = 5 * 60 * 1000;

export function monthlyAllowance(): { searches: number; lookups: number } {
  const n = (v: string | undefined, fallback: number, max: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x >= 0 && x <= max ? x : fallback;
  };
  return {
    searches: n(process.env.SPEAKER_ISLAND_MONTHLY_SEARCHES, 10, 100),
    lookups: n(process.env.SPEAKER_ISLAND_MONTHLY_LOOKUPS, 20, 200),
  };
}

function secret(): string | null {
  const s = process.env.SPEAKER_ISLAND_SSO_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

export function signPortalToken(payload: PortalSsoPayload, key: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

/** The payload if the link is genuine, unexpired and well formed; otherwise null. */
export function verifyPortalToken(token: string | null | undefined, now = Date.now(), key = secret()): PortalSsoPayload | null {
  if (!key || !token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = createHmac("sha256", key).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let p: Partial<PortalSsoPayload>;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (p.memberType !== "cast" && p.memberType !== "community") return null;
  if (typeof p.exp !== "number" || p.exp <= now || p.exp > now + MAX_LINK_AGE_MS) return null;
  if (typeof p.nonce !== "string" || p.nonce.length < 16 || p.nonce.length > 100) return null;
  return { email, name: typeof p.name === "string" ? p.name.trim().slice(0, 120) : "", memberType: p.memberType, exp: p.exp, nonce: p.nonce };
}
