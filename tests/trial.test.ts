import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveTrial, trialDaysLeftLabel } from "../src/lib/trial";

const DAY = 24 * 60 * 60 * 1000;

describe("free trial expiry", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("keeps remaining actions inside the 7-day window", () => {
    const trial = effectiveTrial(
      {
        discovery_remaining: 1,
        contact_lookups_remaining: 2,
        expires_at: new Date(now.getTime() + 6.5 * DAY).toISOString(),
      },
      now
    );
    assert.equal(trial?.expired, false);
    assert.equal(trial?.discoveryRemaining, 1);
    assert.equal(trial?.contactsRemaining, 2);
    assert.equal(trial?.daysLeft, 7);
  });

  it("zeroes remaining actions once expired", () => {
    const trial = effectiveTrial(
      {
        discovery_remaining: 1,
        contact_lookups_remaining: 2,
        expires_at: new Date(now.getTime() - 1000).toISOString(),
      },
      now
    );
    assert.equal(trial?.expired, true);
    assert.equal(trial?.discoveryRemaining, 0);
    assert.equal(trial?.contactsRemaining, 0);
    assert.equal(trial?.daysLeft, 0);
  });

  it("returns null without an entitlement and labels days", () => {
    assert.equal(effectiveTrial(null, now), null);
    assert.equal(trialDaysLeftLabel(1), "1 day left");
    assert.equal(trialDaysLeftLabel(5), "5 days left");
    assert.equal(trialDaysLeftLabel(0), "expired");
  });
});

describe("Speaker Island monthly allowance", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("lets each remaining action be a search or a contact lookup", () => {
    const member = effectiveTrial(
      { discovery_remaining: 9, contact_lookups_remaining: 0, expires_at: "2026-12-01T05:00:00Z", source: "speaker_island" },
      now
    );
    assert.equal(member?.speakerIsland, true);
    assert.equal(member?.discoveryRemaining, 9);
    assert.equal(member?.contactsRemaining, 9, "lookups draw on the same 9, not a separate 0");
  });
});
