export type OpportunityStatus = "open" | "closed" | "unknown" | "watch";
export type VisibilityTier = "A" | "B" | "C";
export type OrgType =
  | "conference"
  | "speaker_bureau"
  | "association_portfolio"
  | "expo_circuit"
  | "corporate_event"
  | "other";

export interface EventRecord {
  id: string;
  sector: string;
  event_name: string;
  opportunity_type: string | null;
  event_start: string | null;
  event_end: string | null;
  date_notes: string | null;
  city: string | null;
  state_country: string | null;
  venue_format: string | null;
  status: OpportunityStatus;
  cfp_deadline: string | null;
  audience_reach: string | null;
  potential_cost: string | null;
  why_it_matters: string | null;
  best_client_fit: string | null;
  booking_path: string | null;
  source_url: string | null;
  visibility_tier: VisibilityTier | null;
  source_id: string | null;
  discovered_via: string;
  discovery_query: string | null;
  raw_extract: unknown;
  created_at: string;
  updated_at: string;
}

export interface ContactRecord {
  id: string;
  event_id: string;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  confidence: "high" | "medium" | "low" | null;
  source_url: string | null;
  found_via: string;
  created_at: string;
}

export interface DiscoveryScheduleRecord {
  id: string;
  sector: string;
  query: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_summary: string | null;
  created_at: string;
}

export interface EventInput {
  sector: string;
  event_name: string;
  opportunity_type?: string | null;
  event_start?: string | null;
  event_end?: string | null;
  date_notes?: string | null;
  city?: string | null;
  state_country?: string | null;
  venue_format?: string | null;
  status?: OpportunityStatus;
  cfp_deadline?: string | null;
  audience_reach?: string | null;
  potential_cost?: string | null;
  why_it_matters?: string | null;
  best_client_fit?: string | null;
  booking_path?: string | null;
  source_url?: string | null;
  visibility_tier?: VisibilityTier | null;
  discovered_via?: string;
  discovery_query?: string | null;
  raw_extract?: unknown;
}
