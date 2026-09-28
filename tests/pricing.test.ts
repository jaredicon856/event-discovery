import assert from "node:assert/strict";
import test from "node:test";
import { CREDIT_COSTS } from "../src/lib/credits";
import { PLANS, annualSavingsUsd } from "../src/lib/plans";
import { TOPUP_PACKS } from "../src/lib/stripe";

test("launch plans preserve approved prices and allowances", () => {
  assert.deepEqual(
    PLANS.map(({ id, priceMonthly, priceAnnual, creditsPerCycle }) => ({
      id,
      priceMonthly,
      priceAnnual,
      creditsPerCycle,
    })),
    [
      { id: "starter", priceMonthly: 79, priceAnnual: 790, creditsPerCycle: 1000 },
      { id: "growth", priceMonthly: 199, priceAnnual: 1990, creditsPerCycle: 2500 },
      { id: "scale", priceMonthly: 499, priceAnnual: 4990, creditsPerCycle: 6500 },
    ]
  );
});

test("annual pricing is 10× monthly (~16.7% / two months free)", () => {
  for (const plan of PLANS) {
    assert.equal(plan.priceAnnual, plan.priceMonthly * 10);
    assert.equal(annualSavingsUsd(plan), plan.priceMonthly * 2);
  }
});

test("metered actions use the published 20-credit rate", () => {
  assert.equal(CREDIT_COSTS.discovery, 20);
  assert.equal(CREDIT_COSTS.enrichment, 20);
});

test("documented stress margins include Stripe fees and infrastructure allocation", () => {
  const infrastructureByPlan = {
    starter: 2.5,
    growth: 4,
    scale: 6,
  } as const;
  const expectedMargins = {
    starter: 0.6754,
    growth: 0.6911,
    scale: 0.6909,
  } as const;
  for (const plan of PLANS) {
    const actions = plan.creditsPerCycle / 20;
    const aiCost = actions * 0.4;
    const stripeFee = plan.priceMonthly * 0.036 + 0.3;
    const infrastructure = infrastructureByPlan[plan.id];
    const margin =
      (plan.priceMonthly - aiCost - stripeFee - infrastructure) / plan.priceMonthly;
    assert.ok(
      Math.abs(margin - expectedMargins[plan.id]) < 0.0001,
      `${plan.name} stress margin was ${(margin * 100).toFixed(2)}%`
    );
  }
});

test("top-up packs never undercut the Starter plan's per-credit price", () => {
  const starter = PLANS.find((plan) => plan.id === "starter");
  assert.ok(starter);
  const starterRate = starter.priceMonthly / starter.creditsPerCycle;
  for (const pack of TOPUP_PACKS) {
    const rate = pack.priceUsd / pack.credits;
    assert.ok(
      rate >= starterRate,
      `${pack.name} is ${rate.toFixed(4)}/credit, cheaper than Starter ${starterRate.toFixed(4)}`
    );
  }
});
