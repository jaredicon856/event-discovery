export const SECTOR_CATALOGUE = [
  { id: "healthcare", label: "Healthcare & life sciences" },
  { id: "financial_services", label: "Financial services" },
  { id: "technology", label: "Technology & SaaS" },
  { id: "professional_services", label: "Professional services" },
  { id: "education", label: "Education" },
  { id: "energy", label: "Energy & industrials" },
  { id: "real_estate", label: "Real estate & construction" },
  { id: "consumer", label: "Consumer & retail" },
  { id: "nonprofit", label: "Nonprofit & associations" },
  { id: "other", label: "Other" },
] as const;

/**
 * Extraction writes a free-text sector description (e.g. "Financial Services
 * - Anti-Fraud/Forensic Accounting", "Enterprise Analytics / AI"), never one
 * of the 10 canonical IDs above — so anything that filters/matches by sector
 * has to go through this alias list, not an exact string match. Shared by
 * search-time validation (opportunityValidation.ts) and the results filter
 * bar (filters.ts) so "Financial services" means the same thing in both
 * places. A raw events.sector value satisfies a requested sector id if it
 * contains any of that id's alias substrings.
 */
export const SECTOR_ALIASES: Record<string, string[]> = {
  healthcare: ["healthcare", "health care", "life science", "medical", "hospital", "pharma"],
  financial_services: ["financial", "finance", "banking", "fintech", "insurance"],
  technology: ["technology", "tech", "saas", "software", "digital", "analytics", "data center", "infrastructure"],
  professional_services: ["professional services", "consulting", "legal", "accounting"],
  education: ["education", "academic", "university", "school"],
  energy: ["energy", "industrial", "utilities", "oil", "gas", "renewable"],
  real_estate: ["real estate", "construction", "property"],
  consumer: ["consumer", "retail", "commerce", "hospitality"],
  nonprofit: ["nonprofit", "non-profit", "charity", "association"],
  other: ["other"],
};

export function sectorMatches(rawSector: string, requestedSectorId: string): boolean {
  const normalized = rawSector.toLowerCase().replaceAll("_", " ");
  const requested = requestedSectorId.toLowerCase().replaceAll("_", " ");
  return (SECTOR_ALIASES[requestedSectorId] ?? [requested]).some((alias) => normalized.includes(alias));
}

export const OPPORTUNITY_TYPES = [
  { id: "conference", label: "Conference / summit", dated: true },
  { id: "panel", label: "Panel", dated: true },
  { id: "workshop", label: "Workshop", dated: true },
  { id: "expo", label: "Expo / circuit", dated: true },
  { id: "podcast", label: "Podcast", dated: false },
  { id: "standing_program", label: "Standing speaker program", dated: false },
] as const;

export type OpportunityTypeId = (typeof OPPORTUNITY_TYPES)[number]["id"];

export interface SearchCriteria {
  sectors: string[];
  location: string;
  dateFrom: string;
  dateTo: string;
  types: OpportunityTypeId[];
  expertise: string;
  audience: string;
  customQuery?: string;
}

export function defaultDateWindow(today = new Date()): { dateFrom: string; dateTo: string } {
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today);
  toDate.setUTCMonth(toDate.getUTCMonth() + 18);
  return { dateFrom: from, dateTo: toDate.toISOString().slice(0, 10) };
}

export function isUndatedType(type: string | null | undefined): boolean {
  const normalized = (type ?? "").toLowerCase();
  return (
    normalized.includes("podcast") ||
    normalized.includes("standing") ||
    normalized.includes("speaker program") ||
    normalized.includes("ongoing")
  );
}

export function buildResearchSummary(criteria: SearchCriteria): string {
  const sectors = criteria.sectors.length
    ? criteria.sectors
        .map((id) => SECTOR_CATALOGUE.find((sector) => sector.id === id)?.label ?? id.replaceAll("_", " "))
        .join(", ")
    : "any sector";
  const types = criteria.types.length
    ? criteria.types.map((id) => OPPORTUNITY_TYPES.find((type) => type.id === id)?.label ?? id).join(", ")
    : "speaking opportunities";
  const location = criteria.location.trim() || "any location";
  const topic = criteria.expertise.trim() ? ` focused on ${criteria.expertise.trim()}` : "";
  const audience = criteria.audience.trim() ? ` for ${criteria.audience.trim()} audiences` : "";
  return `${types} in ${sectors}${topic}${audience}, ${location}, between ${criteria.dateFrom} and ${criteria.dateTo}.`;
}

export function buildResearchQuery(criteria: SearchCriteria): string {
  if (criteria.customQuery?.trim()) return criteria.customQuery.trim();
  const summary = buildResearchSummary(criteria);
  return `Find current, verifiable ${summary} Prioritize official call-for-speakers, proposal, speaker application, and guest pitch pages.`;
}

export function parseCriteria(input: unknown): SearchCriteria {
  const defaults = defaultDateWindow();
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const types = Array.isArray(raw.types)
    ? (raw.types.filter((value): value is OpportunityTypeId =>
        OPPORTUNITY_TYPES.some((type) => type.id === value)
      ) as OpportunityTypeId[])
    : (["conference", "panel", "workshop", "podcast"] as OpportunityTypeId[]);
  const sectors = Array.isArray(raw.sectors)
    ? raw.sectors.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : typeof raw.sector === "string" && raw.sector.trim()
      ? [raw.sector.trim()]
      : [];
  return {
    sectors,
    location: typeof raw.location === "string" ? raw.location.trim() : "",
    dateFrom: typeof raw.dateFrom === "string" && raw.dateFrom ? raw.dateFrom : defaults.dateFrom,
    dateTo: typeof raw.dateTo === "string" && raw.dateTo ? raw.dateTo : defaults.dateTo,
    types,
    expertise: typeof raw.expertise === "string" ? raw.expertise.trim() : "",
    audience: typeof raw.audience === "string" ? raw.audience.trim() : "",
    customQuery: typeof raw.customQuery === "string" ? raw.customQuery : undefined,
  };
}
