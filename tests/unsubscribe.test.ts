import { test } from "node:test";
import assert from "node:assert/strict";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/email/unsubscribe";

const KEY = "k".repeat(32);
const ID = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";

test("a genuine unsubscribe token returns the profile id", () => {
  assert.equal(verifyUnsubscribeToken(signUnsubscribeToken(ID, KEY), KEY), ID);
});

test("tampered, re-keyed, malformed or missing tokens are refused", () => {
  const token = signUnsubscribeToken(ID, KEY)!;
  const [, sig] = token.split(".");
  const other = "4a2b9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";
  assert.equal(verifyUnsubscribeToken(`${other}.${sig}`, KEY), null);
  assert.equal(verifyUnsubscribeToken(token, "x".repeat(32)), null);
  assert.equal(verifyUnsubscribeToken(`not-an-id.${sig}`, KEY), null);
  assert.equal(verifyUnsubscribeToken(`${token}.extra`, KEY), null);
  assert.equal(verifyUnsubscribeToken(null, KEY), null);
  assert.equal(verifyUnsubscribeToken(token, null as unknown as string), null);
});

test("without a signing secret no token is produced", () => {
  assert.equal(signUnsubscribeToken(ID, null as unknown as string), null);
});
