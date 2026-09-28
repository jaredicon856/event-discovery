/** Cycle AI spend ÷ plan list price. Above this → margin_risk. Override with ADMIN_MARGIN_RISK_RATIO. */
export const DEFAULT_MARGIN_RISK_RATIO = 0.55;
export const CEILING_HIT_WINDOW_HOURS = 24;
export const CEILING_HIT_MIN_COUNT = 3;

export type MemberSpendFlag = "margin_risk" | "usage_ceiling";

export function marginRiskThresholdRatio(): number {
  const raw = Number.parseFloat(process.env.ADMIN_MARGIN_RISK_RATIO ?? "");
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return DEFAULT_MARGIN_RISK_RATIO;
}

export function evaluateMemberSpendFlags(input: {
  cycleSpendUsd: number;
  paidRevenueUsd: number | null;
  insufficientHits24h: number;
  thresholdRatio?: number;
}): { marginRiskRatio: number | null; flags: MemberSpendFlag[] } {
  const threshold = input.thresholdRatio ?? marginRiskThresholdRatio();
  const flags: MemberSpendFlag[] = [];
  let marginRiskRatio: number | null = null;

  if (input.paidRevenueUsd != null && input.paidRevenueUsd > 0) {
    marginRiskRatio = input.cycleSpendUsd / input.paidRevenueUsd;
    if (marginRiskRatio >= threshold) flags.push("margin_risk");
  }
  if (input.insufficientHits24h >= CEILING_HIT_MIN_COUNT) {
    flags.push("usage_ceiling");
  }
  return { marginRiskRatio, flags };
}
