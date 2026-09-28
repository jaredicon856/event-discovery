export function splitPersonName(value: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function composeFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").trim();
}

export function isProfileComplete(profile: { full_name?: string | null }): boolean {
  const { firstName, lastName } = splitPersonName(profile.full_name);
  return firstName.length > 0 && lastName.length > 0;
}

export function namesFromAuthMetadata(
  metadata: Record<string, unknown> | null | undefined
): { firstName: string; lastName: string } {
  const given = String(metadata?.given_name ?? "").trim();
  const family = String(metadata?.family_name ?? "").trim();
  if (given || family) return { firstName: given, lastName: family };
  return splitPersonName(String(metadata?.full_name ?? metadata?.name ?? ""));
}
