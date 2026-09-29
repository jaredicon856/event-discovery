import assert from "node:assert/strict";
import test from "node:test";
import {
  TOPUP_MAX_USD,
  TOPUP_MIN_USD,
  creditsForAmountCents,
  isValidTopupAmount,
  quoteTopup,
} from "../src/lib/topup";
import { PLANS } from "../src/lib/plans";

test("paying a plan's price as a top-up buys exactly that plan's credits", () => {
  for (const plan of PLANS) {
    assert.equal(quoteTopup(plan.priceMonthly).credits, plan.creditsPerCycle, plan.name);
  }
});

test("top-up quick picks and limits", () => {
  assert.equal(quoteTopup(20).credits, 253);
  assert.equal(quoteTopup(50).credits, 632);
  assert.equal(quoteTopup(100).credits, 1262);
  assert.equal(quoteTopup(2000).credits, 26052);
  assert.equal(quoteTopup(79).actions, 50);
});

test("more money always buys more credits", () => {
  let previous = 0;
  for (let usd = TOPUP_MIN_USD; usd <= TOPUP_MAX_USD; usd += 1) {
    const credits = quoteTopup(usd).credits;
    assert.ok(credits > previous, `$${usd} bought ${credits}, not more than ${previous}`);
    previous = credits;
  }
});

test("top-up amounts must be whole dollars within the limits", () => {
  assert.equal(isValidTopupAmount(TOPUP_MIN_USD), true);
  assert.equal(isValidTopupAmount(TOPUP_MAX_USD), true);
  assert.equal(isValidTopupAmount(TOPUP_MIN_USD - 1), false);
  assert.equal(isValidTopupAmount(TOPUP_MAX_USD + 1), false);
  assert.equal(isValidTopupAmount(25.5), false);
  assert.equal(isValidTopupAmount("50"), false);
  assert.equal(isValidTopupAmount(Number.NaN), false);
});

test("webhook credits come only from the amount actually paid", () => {
  assert.equal(creditsForAmountCents(79_00), 1000);
  assert.equal(creditsForAmountCents(0), 0);
  assert.equal(creditsForAmountCents(-100), 0);
});
