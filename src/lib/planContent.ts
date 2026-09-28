import type { PlanDefinition } from "@/lib/stripe";

export interface PlanContent {
  /** One line under the price on the billing cards. */
  audience: string;
  /** Call-to-action wording for this tier. */
  cta: string;
  /** Headline sentence on the dedicated plan page. */
  tagline: string;
  bestFor: string[];
}

export const PLAN_FEATURES = [
  "Live web opportunity research",
  "Contact enrichment on demand",
  "Saved lists, CSV and PDF exports",
  "Private customer workspace",
];

export const PLAN_CONTENT: Record<PlanDefinition["id"], PlanContent> = {
  starter: {
    audience: "For building a consistent speaking pipeline",
    cta: "Start discovering",
    tagline: "Build a steady flow of credible stages without overcommitting.",
    bestFor: [
      "Independent speakers and consultants",
      "Testing Event Scout against a real pipeline",
      "A handful of researched opportunities each month",
    ],
  },
  growth: {
    audience: "For active experts and growing teams",
    cta: "Build momentum",
    tagline: "Keep a full pipeline moving with room for weekly research.",
    bestFor: [
      "Experts pitching year-round",
      "Small teams sharing one research workspace",
      "Regular discovery plus organizer contact research",
    ],
  },
  scale: {
    audience: "For agencies and high-volume research",
    cta: "Scale your pipeline",
    tagline: "Run high-volume research across multiple sectors and clients.",
    bestFor: [
      "Agencies managing several speakers",
      "Multi-sector or multi-region research",
      "Teams that research opportunities every week",
    ],
  },
};
