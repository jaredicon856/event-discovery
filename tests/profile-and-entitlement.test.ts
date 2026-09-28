import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { canScheduleSearch } from "../src/lib/credits";
import { validateProfileImage } from "../src/lib/profile";
import { ACCOUNT_TIMEZONE, formatAccountDate, formatAccountDateTime } from "../src/lib/timezone";
import {
  composeFullName,
  isProfileComplete,
  namesFromAuthMetadata,
  splitPersonName,
} from "../src/lib/profileCompletion";

test("only an active paid customer or server-verified owner is schedule eligible", () => {
  assert.equal(canScheduleSearch("super_admin", false), true);
  assert.equal(canScheduleSearch("user", true), true);
  assert.equal(canScheduleSearch("user", false), false);
  assert.equal(canScheduleSearch("forged_role", false), false);
});

test("profile photos are decoded and sanitized, not trusted by MIME or filename", async () => {
  const png = await sharp({
    create: {
      width: 20,
      height: 10,
      channels: 4,
      background: { r: 197, g: 154, b: 72, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const validated = await validateProfileImage(png);
  assert.equal(validated.mimeType, "image/png");
  assert.equal(validated.width, 20);
  assert.equal(validated.height, 10);
  assert.ok(validated.sanitizedBytes.byteLength > 0);

  const forged = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(8),
    Buffer.from([0, 0, 0, 1, 0, 0, 0, 1]),
    Buffer.from("not-an-image"),
  ]);
  await assert.rejects(() => validateProfileImage(forged), /decoded|match/);
});

test("workspace dates always use US Eastern Time", () => {
  assert.equal(ACCOUNT_TIMEZONE, "America/New_York");
  const winter = new Date("2026-01-15T17:00:00.000Z");
  const summer = new Date("2026-07-15T17:00:00.000Z");
  assert.equal(formatAccountDate(winter), "Jan 15, 2026");
  assert.match(formatAccountDateTime(winter), /Jan 15, 2026, 12:00 PM EST/);
  assert.equal(formatAccountDate(summer), "Jul 15, 2026");
  assert.match(formatAccountDateTime(summer), /Jul 15, 2026, 1:00 PM EDT/);
});

test("a completed profile requires first and last name", () => {
  assert.equal(isProfileComplete({ full_name: null }), false);
  assert.equal(isProfileComplete({ full_name: "Richard" }), false);
  assert.equal(isProfileComplete({ full_name: "Richard Delvin" }), true);
  assert.deepEqual(splitPersonName("Richard Delvin"), { firstName: "Richard", lastName: "Delvin" });
  assert.deepEqual(namesFromAuthMetadata({ full_name: "Richard Delvin" }), { firstName: "Richard", lastName: "Delvin" });
  assert.deepEqual(namesFromAuthMetadata({ given_name: "Richard", family_name: "Delvin" }), {
    firstName: "Richard",
    lastName: "Delvin",
  });
  assert.equal(composeFullName(" Richard ", " Delvin "), "Richard Delvin");
});
