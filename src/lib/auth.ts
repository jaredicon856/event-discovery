import { NextRequest } from "next/server";

export function assertCronAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return; // no secret configured: open (local dev)
  const provided = request.headers.get("x-cron-secret");
  if (provided !== expected) {
    throw new UnauthorizedError();
  }
}

export class UnauthorizedError extends Error {}
