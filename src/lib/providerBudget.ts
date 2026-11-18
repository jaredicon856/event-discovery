import type { AgentUsage } from "@/lib/agent";

/**
 * Ceiling on discovery COGS (research + fallback + extraction) for a single
 * run — a runaway-cost SAFETY NET, not a margin-tuning knob. Product
 * decision (24 Sep 2026): credits are the real monetization lever, not our
 * internal per-search dollar spend. A customer already commits a fixed
 * number of credits per discovery regardless of how much research it takes
 * to do a good job, and a customer who wants more thoroughness can run more
 * searches (more credits, more revenue) — so this must not be tuned tight to
 * protect margin on any one call the way it was before. It exists only to
 * catch a genuinely pathological run (a bug, a retry loop) before it spends
 * an unbounded amount, not to cap normal deep/broad research.
 */
export const TARGET_DISCOVERY_USD = 2.0;

/**
 * Assumed input-context overhead (system prompt + tool schema + in-loop
 * tool-call/result history) for a research-type provider call, used only to
 * pre-estimate cost before spending money. The prior estimate used just
 * `query.length + 2000` chars, which is 40-100x smaller than the input
 * token counts actually observed on live research calls (21k-82k tokens),
 * making the budget gate nearly meaningless. This is a conservative
 * mid-range planning number, not a precise prediction — real cost still
 * varies with how many web-search results get pulled into context.
 */
export const RESEARCH_PROMPT_OVERHEAD_CHARS = 100_000;

export const RESEARCH_MAX_SEARCHES = 4;
/**
 * Raised from 2500 (24 Sep 2026): a broad multi-sector/multi-type search's
 * own research narrative was observed hitting this ceiling mid-answer —
 * announcing it would cover podcasts, then getting cut off before doing so,
 * entirely for lack of output-token room. See also the fallback-research
 * trigger in discovery.ts, which now also re-runs on a truncated pass.
 */
//
// Raised again (18 Nov 2026): the model thinks by default and its thinking
// counts against max_tokens, so 4000 left too little for the answer. Every
// customer search on record had a truncated research pass; one returned 11
// bare event names with no dates or links, which validation discarded, and
// another (a Speaker Island member's, 10 Nov) saved nothing at all. The
// prompts now also ask for a bounded, compact list, so these ceilings are
// headroom, not the expected length.
export const RESEARCH_MAX_TOKENS = 10000;
export const FALLBACK_MAX_SEARCHES = 3;
export const FALLBACK_MAX_TOKENS = 8000;
// Extraction runs with thinking off, so all of this goes to the event rows.
// The retry used to get a SMALLER ceiling than the call that was cut off,
// which guaranteed it would be cut off too.
export const EXTRACTION_MAX_TOKENS = 8000;
export const EXTRACTION_RETRY_MAX_TOKENS = 8000;
// The widened pass that runs when the exact and fallback passes found nothing.
export const BROADENED_MAX_SEARCHES = 3;
export const BROADENED_MAX_TOKENS = 8000;
export const FINDINGS_CHAR_BUDGET = 48_000;

const INPUT_PER_TOKEN = 0.000002;
const OUTPUT_PER_TOKEN = 0.00001;
const SEARCH_USD = 0.01;

export function estimateCallUsd(params: {
  inputChars: number;
  maxTokens: number;
  maxSearches: number;
}): number {
  const inputTokens = Math.ceil(params.inputChars / 4);
  return inputTokens * INPUT_PER_TOKEN + params.maxTokens * OUTPUT_PER_TOKEN + params.maxSearches * SEARCH_USD;
}

export function remainingDiscoveryBudget(spentUsd: number): number {
  return TARGET_DISCOVERY_USD - spentUsd;
}

export function canAffordCall(spentUsd: number, estimatedCallUsd: number): boolean {
  return remainingDiscoveryBudget(spentUsd) >= estimatedCallUsd;
}

export function spentFromUsage(usage: AgentUsage | null | undefined): number {
  return usage?.estimatedCostUsd ?? 0;
}

export function trimFindings(findings: string, maxChars = FINDINGS_CHAR_BUDGET): string {
  if (findings.length <= maxChars) return findings;
  return `${findings.slice(0, maxChars)}\n\n[Research findings truncated to stay within the extraction context budget.]`;
}
