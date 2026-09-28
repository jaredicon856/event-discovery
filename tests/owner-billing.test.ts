import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyOwnerClient,
  cyclePriceForPlan,
  monthlyEquivalentForPlan,
} from "../src/lib/ownerBilling";
import { getPlan } from "../src/lib/plans";

describe("owner billing classification", () => {
  it("flags new accounts, trial ending, annual, and monthly ending", () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const endingSoon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const trial = classifyOwnerClient({
      createdAt: recent,
      planId: null,
      planStatus: null,
      billingInterval: null,
      periodEnd: null,
      trialDiscoveryRemaining: 1,
      trialContactsRemaining: 2,
      trialExpiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(trial.isNew, true);
    assert.equal(trial.isTrialEnding, false);
    assert.equal(trial.status, "trial");

    const expiringTrial = classifyOwnerClient({
      createdAt: recent,
      planId: null,
      planStatus: null,
      billingInterval: null,
      periodEnd: null,
      trialDiscoveryRemaining: 1,
      trialContactsRemaining: 2,
      trialExpiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(expiringTrial.isTrialEnding, true);
    assert.equal(expiringTrial.status, "trial_ending");

    const searchUsed = classifyOwnerClient({
      createdAt: recent,
      planId: null,
      planStatus: null,
      billingInterval: null,
      periodEnd: null,
      trialDiscoveryRemaining: 0,
      trialContactsRemaining: 2,
      trialExpiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    });
    assert.equal(searchUsed.status, "trial_ending");

    const expired = classifyOwnerClient({
      createdAt: recent,
      planId: null,
      planStatus: null,
      billingInterval: null,
      periodEnd: null,
      trialDiscoveryRemaining: 1,
      trialContactsRemaining: 2,
      trialExpiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    assert.equal(expired.isTrialEnding, false);
    assert.equal(expired.status, "trial_expired");

    const annual = classifyOwnerClient({
      createdAt: recent,
      planId: "growth",
      planStatus: "active",
      billingInterval: "year",
      periodEnd: endingSoon,
      trialDiscoveryRemaining: null,
      trialContactsRemaining: null,
    });
    assert.equal(annual.isAnnual, true);
    assert.equal(annual.isMonthlyEnding, false);
    assert.equal(annual.status, "active_plan");

    const monthly = classifyOwnerClient({
      createdAt: recent,
      planId: "starter",
      planStatus: "active",
      billingInterval: "month",
      periodEnd: endingSoon,
      trialDiscoveryRemaining: null,
      trialContactsRemaining: null,
    });
    assert.equal(monthly.isMonthlyEnding, true);
    assert.equal(monthly.isAnnual, false);
  });

  it("prices monthly and annual catalog equivalents", () => {
    const starter = getPlan("starter");
    assert.equal(cyclePriceForPlan(starter, "month"), 79);
    assert.equal(cyclePriceForPlan(starter, "year"), 790);
    assert.equal(monthlyEquivalentForPlan(starter, "year"), Math.round((790 / 12) * 100) / 100);
  });
});
