export function annualGrantKey(stripeSubscriptionId: string, sliceStart: Date): string {
  const y = sliceStart.getUTCFullYear();
  const m = String(sliceStart.getUTCMonth() + 1).padStart(2, "0");
  return `annual_cycle:${stripeSubscriptionId}:${y}-${m}`;
}
