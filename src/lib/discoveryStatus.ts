const ACTIVE_DISCOVERY_STATUSES = new Set(["queued", "running"]);

export function isDiscoveryTerminal(status: string): boolean {
  return !ACTIVE_DISCOVERY_STATUSES.has(status);
}

export function handleDiscoveryPollStatus(
  status: string,
  actions: { onTerminal: () => void; onContinue: () => void }
): void {
  if (isDiscoveryTerminal(status)) {
    actions.onTerminal();
    return;
  }
  actions.onContinue();
}
