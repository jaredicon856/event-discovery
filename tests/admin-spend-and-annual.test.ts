import assert from "node:assert/strict";
import test from "node:test";
import {
  CEILING_HIT_MIN_COUNT,
  DEFAULT_MARGIN_RISK_RATIO,
  evaluateMemberSpendFlags,
} from "../src/lib/adminSpendFlags";
import { annualGrantKey } from "../src/lib/annualCreditKeys";
import { getPlan } from "../src/lib/plans";
import { decidePaidInvoice } from "../src/lib/stripeLifecycle";

test("margin risk flags when cycle AI spend exceeds the configured share of plan price", () => {
  const starter = getPlan("starter")!;
  const hot = evaluateMemberSpendFlags({
    cycleSpendUsd: starter.priceMonthly * DEFAULT_MARGIN_RISK_RATIO,
    paidRevenueUsd: starter.priceMonthly,
    insufficientHits24h: 0,
  });
  assert.ok(hot.flags.includes("margin_risk"));
  assert.equal(hot.marginRiskRatio, DEFAULT_MARGIN_RISK_RATIO);

  const healthy = evaluateMemberSpendFlags({
    cycleSpendUsd: starter.priceMonthly * 0.2,
    paidRevenueUsd: starter.priceMonthly,
    insufficientHits24h: 0,
  });
  assert.equal(healthy.flags.includes("margin_risk"), false);
});

test("usage ceiling flags repeated insufficient debit attempts", () => {
  const flagged = evaluateMemberSpendFlags({
    cycleSpendUsd: 0,
    paidRevenueUsd: null,
    insufficientHits24h: CEILING_HIT_MIN_COUNT,
  });
  assert.deepEqual(flagged.flags, ["usage_ceiling"]);
});

test("annual invoice cycle still grants only one monthly allowance", () => {
  const growth = getPlan("growth")!;
  assert.deepEqual(
    decidePaidInvoice({
      billingReason: "subscription_create",
      amountPaid: growth.priceAnnual * 100,
      currentAllowance: 0,
      candidatePlan: growth,
    }),
    { kind: "cycle", applyPlan: true, grantAmount: growth.creditsPerCycle }
  );
});

test("annual monthly grant keys are stable per subscription month", () => {
  assert.equal(
    annualGrantKey("sub_123", new Date("2026-03-15T12:00:00.000Z")),
    "annual_cycle:sub_123:2026-03"
  );
});
