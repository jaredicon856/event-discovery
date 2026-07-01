import { NextRequest } from "next/server";

/**
 * Allows two kinds of callers:
 *  1. The dashboard itself (same-origin browser fetch) — no secret needed,
 *     since exposing CRON_SECRET to client JS would defeat its purpose.
 *  2. An external scheduler (Vercel Cron, n8n, curl) presenting the
 *     x-cron-secret header, matched against CRON_SECRET.
 * Requests from other origins/tools with no matching secret are rejected,
 * so a stranger can't hit these routes directly and burn API credits.
 */
export function assertCronAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return; // no secret configured: open (local dev only)

  const provided = request.headers.get("x-cron-secret");
  if (provided === expected) return;

  const origin = request.headers.get("origin");
  if (origin && origin === request.nextUrl.origin) return;

  throw new UnauthorizedError();
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
 * a project env var named CRON_SECRET is set — this is Vercel's own
 * convention, separate from the x-cron-secret header used above for other
 * external callers (n8n, manual curl, etc).
 */
export function assertVercelCronAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new UnauthorizedError();

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return;

  throw new UnauthorizedError();
}

export class UnauthorizedError extends Error {}
