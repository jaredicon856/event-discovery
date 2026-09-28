if (typeof window !== "undefined") {
  throw new Error("src/lib/impersonation.ts must not be imported from a Client Component module.");
}

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "impersonation_token";
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface ImpersonationPayload {
  adminProfileId: string;
  targetProfileId: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.IMPERSONATION_SECRET;
  if (!secret) {
    throw new Error("Missing IMPERSONATION_SECRET");
  }
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

/**
 * Signs a compact `{ adminProfileId, targetProfileId, exp }` payload with an
 * HMAC-SHA256 keyed by the server-only IMPERSONATION_SECRET. The result is
 * `<base64url payload>.<base64url signature>`, safe to store in an httpOnly
 * cookie — nothing about the target Supabase session is swapped.
 */
export function signImpersonationToken(payload: Omit<ImpersonationPayload, "exp">, ttlMs = DEFAULT_TTL_MS): string {
  const full: ImpersonationPayload = { ...payload, exp: Date.now() + ttlMs };
  const payloadB64 = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies signature and expiry. Returns null (never throws) on any invalid,
 * tampered, or expired token so callers can silently fall back to the real
 * authenticated user.
 */
export function verifyImpersonationToken(token: string | undefined | null): ImpersonationPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  let expectedSignature: string;
  try {
    expectedSignature = sign(payloadB64);
  } catch {
    return null;
  }

  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as ImpersonationPayload;
    if (
      typeof payload.adminProfileId !== "string" ||
      typeof payload.targetProfileId !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const IMPERSONATION_COOKIE_NAME = COOKIE_NAME;
export const IMPERSONATION_TTL_MS = DEFAULT_TTL_MS;
