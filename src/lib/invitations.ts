if (typeof window !== "undefined") {
  throw new Error("src/lib/invitations.ts must not be imported from a Client Component module.");
}

import { createHash, randomBytes } from "node:crypto";

export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationRedirectUrl(origin: string, token: string): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("invite", token);
  url.searchParams.set("next", "/set-password");
  return url.toString();
}
