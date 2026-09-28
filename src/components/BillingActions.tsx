"use client";

import { useState } from "react";
import {
  annualEffectiveMonthly,
  annualSavingsUsd,
  type BillingInterval,
  type PlanDefinition,
} from "@/lib/plans";

/**
 * Opened synchronously inside the click handler — a tab opened after the
 * checkout request resolves is treated as a blocked popup.
 */
function openBlankTab(): Window | null {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

async function requestCheckoutUrl(endpoint: string, payload: unknown): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok || !json.url) throw new Error(json.error ?? "Could not start checkout");
  return json.url as string;
}

export function BillingIntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (next: BillingInterval) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-icon-border bg-icon-surface p-1 text-sm font-semibold">
      <button
        type="button"
        onClick={() => onChange("month")}
        className={`cursor-pointer rounded-full px-4 py-2 ${
          value === "month" ? "bg-icon-primary text-white" : "text-icon-text-light hover:text-icon-text"
        }`}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("year")}
        className={`cursor-pointer rounded-full px-4 py-2 ${
          value === "year" ? "bg-icon-primary text-white" : "text-icon-text-light hover:text-icon-text"
        }`}
      >
        Annual
        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide opacity-80">Save ~17%</span>
      </button>
    </div>
  );
}

export function PlanPriceLabel({
  plan,
  interval,
  popular = false,
}: {
  plan: PlanDefinition;
  interval: BillingInterval;
  popular?: boolean;
}) {
  if (interval === "year") {
    return (
      <div>
        <p className="mt-5 flex items-baseline gap-2">
          <span className="text-5xl font-semibold tracking-[-.06em]">${annualEffectiveMonthly(plan)}</span>
          <span className={`text-base font-medium tracking-[-.01em] ${popular ? "text-white/60" : "text-icon-text-light"}`}>
            /mo billed annually
          </span>
        </p>
        <p className={`mt-1 text-xs ${popular ? "text-white/55" : "text-icon-text-light"}`}>
          ${plan.priceAnnual.toLocaleString()}/year · save ${annualSavingsUsd(plan).toLocaleString()} vs monthly
        </p>
      </div>
    );
  }
  return (
    <p className="mt-5 flex items-baseline gap-2">
      <span className="text-5xl font-semibold tracking-[-.06em]">${plan.priceMonthly}</span>
      <span className={`text-base font-medium tracking-[-.01em] ${popular ? "text-white/60" : "text-icon-text-light"}`}>
        per month
      </span>
    </p>
  );
}

export function ChoosePlanButton({
  planId,
  interval = "month",
  disabled,
  featured = false,
  label = "Choose plan",
}: {
  planId: string;
  interval?: BillingInterval;
  disabled?: boolean;
  featured?: boolean;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const checkoutTab = openBlankTab();
    try {
      const url = await requestCheckoutUrl("/api/stripe/checkout", { planId, interval });
      if (checkoutTab) {
        checkoutTab.location.href = url;
        setLoading(false);
      } else {
        window.location.href = url;
      }
    } catch (checkoutError) {
      checkoutTab?.close();
      setError(checkoutError instanceof Error ? checkoutError.message : "Request failed");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading || disabled}
        className={`premium-button w-full disabled:cursor-not-allowed disabled:opacity-50 ${
          featured ? "bg-[#d4ad62] text-[#071d1e]" : "bg-icon-primary text-white"
        }`}
      >
        {loading ? "Opening secure checkout…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function BuyCreditsButton({
  packId,
  label,
  featured = false,
}: {
  packId: string;
  label: string;
  featured?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const checkoutTab = openBlankTab();
    try {
      const url = await requestCheckoutUrl("/api/stripe/checkout-topup", { packId });
      if (checkoutTab) {
        checkoutTab.location.href = url;
        setLoading(false);
      } else {
        window.location.href = url;
      }
    } catch (checkoutError) {
      checkoutTab?.close();
      setError(checkoutError instanceof Error ? checkoutError.message : "Request failed");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`premium-button w-full disabled:cursor-not-allowed disabled:opacity-50 ${
          featured
            ? "bg-[#d4ad62] text-[#071d1e]"
            : "border border-icon-border bg-icon-surface text-icon-text hover:border-icon-primary"
        }`}
      >
        {loading ? "Opening secure checkout…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ManageSubscriptionButton({
  label = "Manage subscription",
  featured = false,
}: {
  label?: string;
  featured?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not open billing portal");
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Request failed");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`premium-button w-full disabled:opacity-50 ${
          featured ? "bg-[#d4ad62] text-[#071d1e]" : "bg-icon-primary text-white"
        }`}
      >
        {loading ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
