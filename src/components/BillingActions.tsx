"use client";

import { useState } from "react";
import {
  annualEffectiveMonthly,
  annualSavingsUsd,
  type BillingInterval,
  type PlanDefinition,
} from "@/lib/plans";
import {
  TOPUP_MAX_USD,
  TOPUP_MIN_USD,
  TOPUP_PRESETS_USD,
  isValidTopupAmount,
  quoteTopup,
} from "@/lib/topup";

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

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function TopupPicker() {
  const [selected, setSelected] = useState<number | "other">(TOPUP_PRESETS_USD[0]);
  const [otherInput, setOtherInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawAmount = selected === "other" ? Number(otherInput) : selected;
  const hasInput = selected !== "other" || otherInput.trim() !== "";
  const valid = isValidTopupAmount(rawAmount);
  const quote = valid ? quoteTopup(rawAmount) : null;
  const inputError =
    hasInput && !valid
      ? `Enter a whole-dollar amount between ${formatUsd(TOPUP_MIN_USD)} and ${formatUsd(TOPUP_MAX_USD)}.`
      : null;

  async function handleBuy() {
    if (!quote) return;
    setLoading(true);
    setError(null);
    const checkoutTab = openBlankTab();
    try {
      const url = await requestCheckoutUrl("/api/stripe/checkout-topup", { amountUsd: quote.amountUsd });
      if (checkoutTab) {
        checkoutTab.location.href = url;
        setLoading(false);
      } else {
        window.location.assign(url);
      }
    } catch (checkoutError) {
      checkoutTab?.close();
      setError(checkoutError instanceof Error ? checkoutError.message : "Request failed");
      setLoading(false);
    }
  }

  const optionClass = (active: boolean) =>
    `cursor-pointer rounded-2xl border p-4 text-left transition ${
      active
        ? "border-icon-primary bg-icon-primary-light ring-1 ring-icon-primary"
        : "border-icon-border bg-icon-background hover:border-icon-primary"
    }`;

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TOPUP_PRESETS_USD.map((amount) => {
          const presetQuote = quoteTopup(amount);
          return (
            <button
              key={amount}
              type="button"
              onClick={() => setSelected(amount)}
              className={optionClass(selected === amount)}
              aria-pressed={selected === amount}
            >
              <span className="block text-2xl font-semibold tracking-[-.04em]">{formatUsd(amount)}</span>
              <span className="mt-1 block text-xs text-icon-text-light">
                {presetQuote.credits.toLocaleString("en-US")} credits
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSelected("other")}
          className={optionClass(selected === "other")}
          aria-pressed={selected === "other"}
        >
          <span className="block text-2xl font-semibold tracking-[-.04em]">Other</span>
          <span className="mt-1 block text-xs text-icon-text-light">Choose any amount</span>
        </button>
      </div>

      {selected === "other" && (
        <div className="mt-4">
          <label htmlFor="topup-amount" className="text-sm font-semibold">
            Amount in US dollars
          </label>
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-icon-text-light">$</span>
            <input
              id="topup-amount"
              type="number"
              inputMode="numeric"
              min={TOPUP_MIN_USD}
              max={TOPUP_MAX_USD}
              step={1}
              autoFocus
              value={otherInput}
              onChange={(event) => setOtherInput(event.target.value)}
              placeholder={`${TOPUP_MIN_USD}–${TOPUP_MAX_USD.toLocaleString("en-US")}`}
              style={{ paddingLeft: "2rem" }}
              className="premium-input text-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          {inputError && <p className="mt-2 text-xs text-red-600">{inputError}</p>}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-icon-border bg-icon-background p-5 text-sm">
        <div className="flex justify-between gap-4">
          <span>Credits</span>
          <span className="font-semibold">{quote ? quote.credits.toLocaleString("en-US") : "—"}</span>
        </div>
        <div className="mt-2 flex justify-between gap-4 text-icon-text-light">
          <span>Covers about</span>
          <span>{quote ? `${quote.actions.toLocaleString("en-US")} searches or contact lookups` : "—"}</span>
        </div>
        <div className="mt-4 flex justify-between gap-4 border-t border-icon-border pt-4 text-base font-semibold">
          <span>Total due</span>
          <span>{quote ? formatUsd(quote.amountUsd) : "—"}</span>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleBuy}
          disabled={!quote || loading}
          className="premium-button w-full bg-[#d4ad62] text-[#071d1e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Opening secure checkout…" : quote ? `Buy ${quote.credits.toLocaleString("en-US")} credits for ${formatUsd(quote.amountUsd)}` : "Choose an amount"}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
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
