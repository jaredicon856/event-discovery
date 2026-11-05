import { test } from "node:test";
import assert from "node:assert/strict";
import { signPortalToken, verifyPortalToken } from "../src/lib/speakerIsland";

const KEY = "k".repeat(40);
const now = 1_800_000_000_000;
const good = { email: "Mara@Example.com", name: "Mara Stefan", memberType: "cast" as const, exp: now + 60_000, nonce: "n".repeat(24) };

test("a genuine Portal link verifies and normalizes the email", () => {
  const p = verifyPortalToken(signPortalToken(good, KEY), now, KEY);
  assert.equal(p?.email, "mara@example.com");
  assert.equal(p?.memberType, "cast");
});

test("tampered, expired, far-future or wrongly keyed links are refused", () => {
  const token = signPortalToken(good, KEY);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...good, email: "owner@example.com" })).toString("base64url");
  assert.equal(verifyPortalToken(`${forged}.${sig}`, now, KEY), null);
  assert.equal(verifyPortalToken(`${body}.${sig}`, now, "x".repeat(40)), null);
  assert.equal(verifyPortalToken(signPortalToken({ ...good, exp: now - 1 }, KEY), now, KEY), null);
  assert.equal(verifyPortalToken(signPortalToken({ ...good, exp: now + 60 * 60_000 }, KEY), now, KEY), null);
  assert.equal(verifyPortalToken(signPortalToken({ ...good, memberType: "admin" as never }, KEY), now, KEY), null);
  assert.equal(verifyPortalToken(token, now, null), null);
});
