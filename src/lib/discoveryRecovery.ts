export type CreditOperationStatus = "charged" | "completed" | "refunded" | "insufficient" | null;

export function shouldResumeFallbackExtraction(
  fallbackResearch: Record<string, unknown> | undefined,
  fallbackExtraction: Record<string, unknown> | undefined
): boolean {
  return Boolean(fallbackResearch?.findings) && !Array.isArray(fallbackExtraction?.events);
}

/**
 * A charge that already left the customer's balance must be honoured even when
 * nothing was saved yet: the work is finished without a second debit rather
 * than being re-sold or silently dropped.
 */
export function isContactResearchCharged(operationStatus: CreditOperationStatus): boolean {
  return operationStatus === "charged" || operationStatus === "completed";
}

export function shouldReuseContactResearch(
  operationStatus: CreditOperationStatus,
  artifact: Record<string, unknown> | undefined
): boolean {
  if (operationStatus !== "charged" && operationStatus !== "completed") return false;
  return Array.isArray(artifact?.contacts) || operationStatus === "completed";
}
