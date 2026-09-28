import type { EventInput } from "@/types/event";
import { isUndatedType, sectorMatches, type SearchCriteria } from "@/lib/searchCriteria";

export type FailureClass =
  | "provider_error"
  | "extraction_truncated"
  | "extraction_failed"
  | "budget_exhausted"
  | "retry_exhausted"
  | "validation";

export interface ValidatedOpportunity {
  event: EventInput;
  matchKind: "exact" | "related";
  mismatchReasons: string[];
  rejectionReason?: string;
}

const URL_PATTERN = /^https?:\/\/\S+$/i;
const CLOSED_EVIDENCE =
  /\b(?:cfp|call for speakers?|speaker applications?|submissions?|proposals?)\b[^.!;\n]{0,80}\b(?:closed|ended|expired|no longer accepting|not accepting)\b|\b(?:closed|ended|expired|no longer accepting|not accepting)\b[^.!;\n]{0,80}\b(?:cfp|call for speakers?|speaker applications?|submissions?|proposals?)\b/i;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(date: Date, from: Date, to: Date): boolean {
  return date >= from && date <= to;
}

function hasDirectOpenEvidence(event: EventInput): boolean {
  const blob = `${event.booking_path ?? ""} ${event.why_it_matters ?? ""} ${JSON.stringify(event.raw_extract ?? {})}`.toLowerCase();
  if (CLOSED_EVIDENCE.test(blob)) return false;
  return (
    /\bcfp\b/.test(blob) ||
    blob.includes("call for speaker") ||
    blob.includes("submit a proposal") ||
    blob.includes("pitch form") ||
    blob.includes("speaker application") ||
    blob.includes("currently accepting")
  );
}

function hasClosedEvidence(event: EventInput): boolean {
  const blob = `${event.booking_path ?? ""} ${event.why_it_matters ?? ""} ${JSON.stringify(event.raw_extract ?? {})}`;
  return CLOSED_EVIDENCE.test(blob);
}

function hasCurrentPitchEvidence(event: EventInput): boolean {
  const path = (event.booking_path ?? "").toLowerCase();
  if (
    !path ||
    /no explicit|not detailed|not published|likely curated|invitation-based|direct outreach|contact via producer|aggregator/.test(path)
  ) {
    return false;
  }
  // Broadened 24 Sep 2026: real extracted booking_path text uses many
  // equivalent phrasings ("Be a Speaker" page, plain "application form")
  // that the original narrower phrase list didn't recognize, silently
  // demoting genuinely evidenced podcasts/standing programs to "related".
  return /apply via|submit via|dedicated .*(guest|speaker)|be a guest|be a speaker|guest application|speaker application|guest form|pitch form|application form|submission form|pitch via|submit a pitch/.test(
    path
  );
}

function matchesRequestedType(opportunityType: string, requestedType: string): boolean {
  const normalized = opportunityType.toLowerCase();
  const aliases: Record<string, string[]> = {
    conference: ["conference", "summit", "annual meeting", "symposium"],
    panel: ["panel"],
    workshop: ["workshop", "breakout"],
    expo: ["expo", "exhibition", "circuit"],
    podcast: ["podcast", "guest interview"],
    standing_program: ["standing speaker", "speaker program", "ongoing program", "content catalog"],
  };
  return (aliases[requestedType] ?? [requestedType.replaceAll("_", " ")]).some((alias) =>
    normalized.includes(alias)
  );
}

// Moved to searchCriteria.ts as `sectorMatches` so the results-page filter
// bar can use the exact same alias list — it was doing a naive exact-string
// match against the same free-text sector field, which almost never matched.

export function normalizeStatus(event: EventInput): EventInput["status"] {
  const current = event.status ?? "unknown";
  if (hasClosedEvidence(event)) return "closed";
  if (current === "open" && !hasDirectOpenEvidence(event)) return "unknown";
  return current;
}

export function validateOpportunity(
  event: EventInput,
  criteria: SearchCriteria,
  today = new Date()
): ValidatedOpportunity {
  const mismatchReasons: string[] = [];
  const sourceUrlRaw = event.source_url?.trim() ?? "";
  const normalizedSourceUrl = sourceUrlRaw.startsWith("http") ? sourceUrlRaw : `https://${sourceUrlRaw}`;
  const hasUsableSourceUrl = sourceUrlRaw.length > 0 && URL_PATTERN.test(normalizedSourceUrl);
  if (!hasUsableSourceUrl) {
    // A missing/unusable link means we can't verify it, so it can never be
    // "exact" (below) — but the underlying opportunity may still be real
    // research worth showing as a suggestion, not silently discarded. A live
    // evaluation (24 Sep 2026) found a genuinely relevant, well-researched
    // event ("Channel Partners Conference & Expo") getting fully dropped
    // from BOTH exact and related purely because extraction never populated
    // a URL string, contributing to empty "no matches" search results.
    mismatchReasons.push("missing_source_url");
  }

  const normalized: EventInput = {
    ...event,
    source_url: hasUsableSourceUrl ? normalizedSourceUrl : (sourceUrlRaw || null),
    status: normalizeStatus(event),
  };

  const start = parseDate(normalized.event_start);
  // A concrete extracted date is a far more reliable signal than the free-text
  // opportunity_type description, which routinely describes a genuinely dated
  // conference as e.g. "Conference/panel speaker (standing CFP portfolio)" —
  // the word "standing" there describes the organizer's recurring program,
  // not that this specific instance is undated. Live evaluation (24 Sep 2026)
  // showed that naive substring matching alone was misrouting real, dated,
  // evidenced conferences into the undated branch, where the much narrower
  // hasCurrentPitchEvidence phrasing (e.g. "submit via") rejected perfectly
  // valid CFP language like "submit ... via online form", collapsing exact
  // matches to zero across an entire evaluation batch.
  const undatedType = isUndatedType(normalized.opportunity_type) && !start;
  const from = parseDate(criteria.dateFrom) ?? today;
  const to = parseDate(criteria.dateTo) ?? today;
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const deadline = parseDate(normalized.cfp_deadline);
  if (deadline && deadline < todayUtc) normalized.status = "closed";

  if (
    criteria.sectors.length > 0 &&
    !criteria.sectors.some((sector) => sectorMatches(normalized.sector ?? "", sector))
  ) {
    mismatchReasons.push("sector_mismatch");
  }

  if (undatedType) {
    // undatedType is only ever true when `start` is absent (see above), so
    // this is always the "no single event date" case.
    normalized.date_notes =
      normalized.date_notes?.trim() || "Standing / ongoing program — no single event date published";
    if (!hasCurrentPitchEvidence(normalized)) {
      mismatchReasons.push("no_current_pitch_evidence");
    }
  } else {
    if (!start) {
      mismatchReasons.push("missing_event_date");
    } else if (start < todayUtc) {
      return {
        event: normalized,
        matchKind: "related",
        mismatchReasons: ["past_dated"],
        rejectionReason: "past_dated",
      };
    } else if (!inRange(start, from, to)) {
      mismatchReasons.push("date_outside_range");
    }
    if (!hasDirectOpenEvidence(normalized)) {
      mismatchReasons.push("no_confirmed_open_evidence");
    }
  }

  if (criteria.location) {
    const locationBlob = `${normalized.city ?? ""} ${normalized.state_country ?? ""} ${normalized.venue_format ?? ""}`.toLowerCase();
    // Support a comma-separated list ("United States, Canada") as an OR of
    // allowed regions — the Location field is a single free-text box, so
    // this is the only way today to say "either of these", not just one.
    const wantedTerms = criteria.location
      .toLowerCase()
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    const isAnyLocation = wantedTerms.every((term) => term === "any" || term === "any location");
    const termMatches = (term: string): boolean => {
      // Extracted state_country is almost always "USA"/"US" (see e.g. "GA,
      // USA"), essentially never the literal words "United States" — a plain
      // substring check on "united states" would reject nearly every real US
      // event. \b word boundaries keep "us" from matching inside "Austin" or
      // "Houston".
      if (term === "united states" || term === "usa" || term === "u.s." || term === "us") {
        return /\busa?\b/.test(locationBlob) || locationBlob.includes("united states");
      }
      return locationBlob.includes(term);
    };
    if (!isAnyLocation && !wantedTerms.some(termMatches)) {
      mismatchReasons.push("location_mismatch");
    }
  }

  if (criteria.types.length && normalized.opportunity_type) {
    // The extracted opportunity_type often describes the SESSION format
    // within the event (e.g. "Call for Speakers (breakout sessions)"), not
    // the event category itself — while the event's actual type is usually
    // right there in its name ("Press Ganey HX27 Conference"). Checking only
    // opportunity_type was rejecting genuine conferences as "type_mismatch"
    // purely because the extraction described the session, not the event.
    const type = `${normalized.opportunity_type} ${normalized.event_name ?? ""}`.toLowerCase();
    const matchesType = criteria.types.some((id) => matchesRequestedType(type, id));
    if (!matchesType) mismatchReasons.push("type_mismatch");
  }

  if (normalized.status === "closed") {
    mismatchReasons.push("submissions_closed");
  }

  if (mismatchReasons.includes("missing_event_date") && !undatedType) {
    return {
      event: normalized,
      matchKind: "related",
      mismatchReasons,
      rejectionReason: "missing_event_date",
    };
  }

  return {
    event: normalized,
    matchKind: mismatchReasons.length ? "related" : "exact",
    mismatchReasons,
  };
}

export function classifyValidated(results: ValidatedOpportunity[]) {
  const exact = results.filter((item) => item.matchKind === "exact" && !item.rejectionReason);
  const related = results.filter((item) => item.matchKind === "related" && !item.rejectionReason);
  const rejected = results.filter((item) => item.rejectionReason);
  return { exact, related, rejected };
}
