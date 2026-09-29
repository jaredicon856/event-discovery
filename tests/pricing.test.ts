import assert from "node:assert/strict";
import test from "node:test";
import { CREDIT_COSTS } from "../src/lib/credits";
import { PLANS, annualSavingsUsd } from "../src/lib/plans";
import { creditsForAmountCents } from "../src/lib/topup";

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

test("top-ups never beat the cheapest monthly plan's per-credit price", () => {
  const cheapestRate = Math.min(...PLANS.map((plan) => plan.priceMonthly / plan.creditsPerCycle));
  for (let usd = 20; usd <= 2000; usd += 1) {
    const rate = usd / creditsForAmountCents(usd * 100);
    assert.ok(rate >= cheapestRate - 1e-9, `$${usd} top-up is ${rate.toFixed(5)}/credit`);
  }
});
