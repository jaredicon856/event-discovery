import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CREDIT_COSTS } from "@/lib/credits";
import { PLANS, areAnnualPlansConfigured, getPlan } from "@/lib/stripe";
import { annualEffectiveMonthly, annualSavingsUsd, type BillingInterval } from "@/lib/plans";
import { PLAN_CONTENT, PLAN_FEATURES } from "@/lib/planContent";
import { PlanDetailCheckout } from "@/components/PlanDetailCheckout";
import { requireActiveUser } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ interval?: string }>;
}) {
  const { planId } = await params;
  const query = await searchParams;
  const plan = getPlan(planId);
  if (!plan) notFound();

  const { user, profile, service: supabase } = await requireActiveUser();
  const content = PLAN_CONTENT[plan.id];
  const isOwner = profile.role === "super_admin";
  const annualConfigured = areAnnualPlansConfigured();
  const initialInterval: BillingInterval =
    annualConfigured && query.interval === "year" ? "year" : "month";

  const { data: subscription } = isOwner
    ? { data: null }
    : await supabase
        .from("subscriptions")
        .select("plan, status")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const planIsLive = subscription?.status === "active" || subscription?.status === "past_due";
  const isCurrent = planIsLive && subscription?.plan === plan.id;

  const discoveryActions = Math.floor(plan.creditsPerCycle / CREDIT_COSTS.discovery);
  const contactLookups = Math.floor(plan.creditsPerCycle / CREDIT_COSTS.enrichment);
  const fullSearches = Math.floor(
    plan.creditsPerCycle / (CREDIT_COSTS.discovery + 7 * CREDIT_COSTS.enrichment)
  );
  const rolloverCap = plan.creditsPerCycle * 2;

  const capacity = [
    { value: plan.creditsPerCycle.toLocaleString(), label: "Credits every month" },
    { value: String(discoveryActions), label: "Discovery searches" },
    { value: String(contactLookups), label: "Contact lookups" },
    { value: `~${fullSearches}`, label: "Searches with 7 contacts" },
  ];

  return (
    <div className="premium-page min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <Link href="/billing" className="animate-enter w-fit text-sm font-semibold text-icon-primary hover:underline">
          ← Back to billing
        </Link>

        <section className="premium-card-dark animate-enter overflow-hidden">
          <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <Image src="/brand/icon-logo.webp" alt="Project ICON" width={90} height={32} className="h-7 w-auto" priority />
                <span aria-hidden className="h-7 w-px bg-gradient-to-b from-transparent via-[#c59a48]/55 to-transparent" />
                <span className="text-sm font-semibold">Event Scout membership</span>
              </div>
              <h1 className="mt-7 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">{plan.name}</h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-white/65">{content.tagline}</p>
              <div className="mt-8 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-6xl font-semibold tracking-[-.06em]">${plan.priceMonthly}</span>
                  <span className="text-lg font-medium text-white/55">per month</span>
                </div>
                {annualConfigured && (
                  <div className="text-sm text-white/55">
                    or ${annualEffectiveMonthly(plan)}/mo billed annually
                    <span className="mt-1 block text-[#d4ad62]">
                      Save ${annualSavingsUsd(plan).toLocaleString()} / year
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-2 text-sm text-white/50">
                {plan.creditsPerCycle.toLocaleString()} credits included each month · cancel anytime
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[.05] p-6">
              <PlanDetailCheckout
                plan={plan}
                contentCta={content.cta}
                isOwner={isOwner}
                isCurrent={Boolean(isCurrent)}
                planIsLive={Boolean(planIsLive)}
                initialInterval={initialInterval}
                annualConfigured={annualConfigured}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {capacity.map((item, index) => (
            <div
              key={item.label}
              className="premium-card reveal-card p-6"
              style={{ "--reveal-index": index } as React.CSSProperties}
            >
              <p className="text-3xl font-semibold tracking-[-.05em]">{item.value}</p>
              <p className="mt-2 text-sm text-icon-text-light">{item.label}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="premium-card p-6 sm:p-7">
            <p className="premium-eyebrow">What you get</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">Included in every plan</h2>
            <ul className="mt-5 grid gap-3.5 text-sm text-icon-text-light">
              {PLAN_FEATURES.map((feature) => (
                <li key={feature} className="flex gap-3">
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-icon-primary" fill="none">
                    <path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-icon-border pt-5 text-sm leading-6 text-icon-text-light">
              Plans differ only by monthly research capacity. Nothing is feature-gated. Annual
              billing prepays the year; credits still grant monthly.
            </p>
          </div>

          <div className="premium-card p-6 sm:p-7">
            <p className="premium-eyebrow">Best suited to</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">Who chooses {plan.name}</h2>
            <ul className="mt-5 grid gap-3.5 text-sm text-icon-text-light">
              {content.bestFor.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-icon-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="premium-card p-6 sm:p-7">
          <p className="premium-eyebrow">How credits work</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">Clear, predictable usage</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-icon-background p-5">
              <p className="text-lg font-semibold">{CREDIT_COSTS.discovery} credits</p>
              <p className="mt-1.5 text-sm leading-6 text-icon-text-light">One discovery search across live web sources.</p>
            </div>
            <div className="rounded-2xl bg-icon-background p-5">
              <p className="text-lg font-semibold">{CREDIT_COSTS.enrichment} credits</p>
              <p className="mt-1.5 text-sm leading-6 text-icon-text-light">One organizer contact lookup for a single opportunity.</p>
            </div>
            <div className="rounded-2xl bg-icon-background p-5">
              <p className="text-lg font-semibold">{rolloverCap.toLocaleString()} credits</p>
              <p className="mt-1.5 text-sm leading-6 text-icon-text-light">Rollover ceiling — up to twice your monthly allowance.</p>
            </div>
          </div>
        </section>

        <section>
          <p className="premium-eyebrow">Compare</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">Other plans</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {PLANS.filter((other) => other.id !== plan.id).map((other) => (
              <Link key={other.id} href={`/billing/plans/${other.id}`} className="premium-card flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-lg font-semibold">{other.name}</p>
                  <p className="mt-1 text-sm text-icon-text-light">
                    ${other.priceMonthly} per month · {other.creditsPerCycle.toLocaleString()} credits
                  </p>
                </div>
                <span aria-hidden className="text-icon-primary">→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
