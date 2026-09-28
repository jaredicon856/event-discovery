import assert from "node:assert/strict";
import test from "node:test";
import { canAffordCall, estimateCallUsd, TARGET_DISCOVERY_USD } from "../src/lib/providerBudget";
import { validateOpportunity, classifyValidated, normalizeStatus } from "../src/lib/opportunityValidation";
import { buildResearchQuery, defaultDateWindow, parseCriteria, sectorMatches } from "../src/lib/searchCriteria";
import { assertStripeSecretIsTestMode, StripeConfigError } from "../src/lib/stripeCheckout";
import { canStartDiscovery, getNonTrialCreditBalance } from "../src/lib/credits";
import { handleDiscoveryPollStatus } from "../src/lib/discoveryStatus";
import {
  shouldResumeFallbackExtraction,
  shouldReuseContactResearch,
} from "../src/lib/discoveryRecovery";
import { extractEvents, ExtractionFailureError } from "../src/lib/agent";

test("dated conferences outside the window are related, not invented forward", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Past Summit",
      opportunity_type: "conference",
      event_start: "2025-01-01",
      source_url: "https://example.com/cfp",
      status: "unknown",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["conference"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.rejectionReason, "past_dated");
});

test("podcasts may be undated standing opportunities", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Leadership Podcast",
      opportunity_type: "podcast",
      event_start: null,
      source_url: "https://example.com/guests",
      booking_path: "Pitch via the guest form",
      status: "unknown",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["podcast"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.matchKind, "exact");
  assert.match(result.event.date_notes ?? "", /ongoing/i);
});

test("a dated conference described as part of a 'standing' CFP portfolio is still evaluated as dated", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Becker's 17th Annual Meeting",
      opportunity_type: "Conference/panel speaker (standing CFP portfolio)",
      event_start: window.dateFrom,
      source_url: "https://conferences.beckershospitalreview.com/call-for-speakers",
      booking_path: "Submit presentation proposal via online form on Becker's CFP page",
      status: "open",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["conference"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(
    result.matchKind,
    "exact",
    "the word 'standing' describing a recurring CFP program must not misroute a dated event into the undated/podcast evidence check"
  );
});

test("a podcast's plain 'application form' / 'Be a Speaker' phrasing counts as pitch evidence", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Healthcare Success Podcast",
      opportunity_type: "Podcast guest pitch",
      event_start: null,
      source_url: "https://example.com/be-a-speaker",
      booking_path: "Direct application form on the show's 'Be a Speaker' page",
      status: "unknown",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["podcast"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.matchKind, "exact");
});

test("podcast aggregators without a direct pitch path stay related", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Aggregator-listed Podcast",
      opportunity_type: "podcast guest",
      event_start: null,
      source_url: "https://example.com/podcast-directory",
      booking_path: "Not detailed; found via a podcasts-to-pitch aggregator",
      status: "unknown",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["podcast"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.matchKind, "related");
  assert.ok(result.mismatchReasons.includes("no_current_pitch_evidence"));
});

test("open status requires direct submission evidence", () => {
  assert.equal(
    normalizeStatus({
      sector: "tech",
      event_name: "Summit",
      status: "open",
      booking_path: "contact organizer",
    }),
    "unknown"
  );
  assert.equal(
    normalizeStatus({
      sector: "tech",
      event_name: "Summit",
      status: "open",
      booking_path: "Submit via the CFP page",
    }),
    "open"
  );
});

test("related mismatches are classified separately from exact matches", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const related = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Remote Workshop",
      opportunity_type: "workshop",
      event_start: window.dateFrom,
      source_url: "https://example.com/event",
      city: "Austin",
      status: "unknown",
    },
    { sectors: ["healthcare"], location: "Chicago", ...window, types: ["workshop"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  const classified = classifyValidated([related]);
  assert.equal(classified.exact.length, 0);
  assert.equal(classified.related.length, 1);
  assert.ok(related.mismatchReasons.includes("location_mismatch"));
});

test("a comma-separated location list matches any of the listed regions", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const canada = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Toronto Summit",
      opportunity_type: "conference",
      event_start: window.dateFrom,
      source_url: "https://example.com/event",
      city: "Toronto",
      state_country: "ON, Canada",
      booking_path: "Submit via the official CFP page",
      status: "open",
    },
    {
      sectors: ["healthcare"],
      location: "United States, Canada",
      ...window,
      types: ["conference"],
      expertise: "",
      audience: "",
    },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(canada.matchKind, "exact");

  const malaysia = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Kuala Lumpur Summit",
      opportunity_type: "conference",
      event_start: window.dateFrom,
      source_url: "https://example.com/event",
      city: "Kuala Lumpur",
      state_country: "Malaysia",
      booking_path: "Submit via the official CFP page",
      status: "open",
    },
    {
      sectors: ["healthcare"],
      location: "United States, Canada",
      ...window,
      types: ["conference"],
      expertise: "",
      audience: "",
    },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.ok(malaysia.mismatchReasons.includes("location_mismatch"));
});

test("'United States' in the location filter matches how events are actually labeled ('USA'/'US')", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const criteria = {
    sectors: ["healthcare"],
    location: "United States, Canada",
    ...window,
    types: ["conference" as const],
    expertise: "",
    audience: "",
  };
  for (const state_country of ["TX, USA", "USA", "US", "Southern US (region, exact city not confirmed)"]) {
    const result = validateOpportunity(
      {
        sector: "healthcare",
        event_name: "Regional Summit",
        opportunity_type: "conference",
        event_start: window.dateFrom,
        source_url: "https://example.com/event",
        state_country,
        booking_path: "Submit via the official CFP page",
        status: "open",
      },
      criteria,
      new Date("2026-09-22T00:00:00Z")
    );
    assert.equal(result.matchKind, "exact", `expected a match for state_country="${state_country}"`);
  }
  // "Austin, TX" must not spuriously match "us" as a bare substring.
  const austin = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Regional Summit",
      opportunity_type: "conference",
      event_start: window.dateFrom,
      source_url: "https://example.com/event",
      city: undefined,
      state_country: "Russia",
      booking_path: "Submit via the official CFP page",
      status: "open",
    },
    criteria,
    new Date("2026-09-22T00:00:00Z")
  );
  assert.ok(austin.mismatchReasons.includes("location_mismatch"), "'Russia' must not falsely match via a bare 'us' substring");
});

test("a conference described by its session format (e.g. 'breakout sessions') still matches on type", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Press Ganey HX27 Conference",
      opportunity_type: "Call for Speakers (breakout sessions)",
      event_start: window.dateFrom,
      source_url: "https://example.com/hx27",
      booking_path: "Submit an abstract via the official CFP portal",
      status: "open",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["conference"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(
    result.matchKind,
    "exact",
    "the event's own name says 'Conference' even though opportunity_type only describes the session format"
  );
});

test("closed submissions are related and cannot enter automatic exact-match research", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Closed Leadership Summit",
      opportunity_type: "conference",
      event_start: window.dateFrom,
      source_url: "https://example.com/closed-cfp",
      status: "closed",
      cfp_deadline: "2026-01-01",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["conference"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.matchKind, "related");
  assert.ok(result.mismatchReasons.includes("submissions_closed"));
});

test("negated open language and wrong sectors cannot become exact matches", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "consumer retail",
      event_name: "Retail Leadership Expo",
      opportunity_type: "conference",
      event_start: window.dateFrom,
      source_url: "https://example.com/closed-cfp",
      status: "open",
      booking_path: "Call for speakers closed; no longer accepting proposals",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["conference"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.event.status, "closed");
  assert.equal(result.matchKind, "related");
  assert.ok(result.mismatchReasons.includes("sector_mismatch"));
  assert.ok(result.mismatchReasons.includes("submissions_closed"));
});

test("conference results do not satisfy a podcast-only search", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "healthcare",
      event_name: "Executive Conference",
      opportunity_type: "conference speaking",
      event_start: window.dateFrom,
      source_url: "https://example.com/conference",
      status: "unknown",
    },
    { sectors: ["healthcare"], location: "", ...window, types: ["podcast"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.matchKind, "related");
  assert.ok(result.mismatchReasons.includes("type_mismatch"));
});

test("a relevant event with no extracted source URL is shown as related, not discarded", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "professional_services",
      event_name: "Channel Partners Conference & Expo",
      opportunity_type: "conference",
      event_start: window.dateFrom,
      source_url: null,
      booking_path: "Online speaker submission form on the official event site",
      status: "open",
    },
    { sectors: ["professional_services"], location: "", ...window, types: ["conference"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.rejectionReason, undefined, "a missing URL alone must not drop the event entirely");
  assert.equal(result.matchKind, "related", "unverifiable link means related at best, never exact");
  assert.ok(result.mismatchReasons.includes("missing_source_url"));
});

test("dated opportunity types require an actual event date", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const result = validateOpportunity(
    {
      sector: "professional_services",
      event_name: "Undated Consulting Conference",
      opportunity_type: "conference",
      event_start: null,
      date_notes: "Call for speakers page is live",
      source_url: "https://example.com/cfp",
      status: "unknown",
    },
    { sectors: ["professional_services"], location: "", ...window, types: ["conference"], expertise: "", audience: "" },
    new Date("2026-09-22T00:00:00Z")
  );
  assert.equal(result.rejectionReason, "missing_event_date");
});

test("a bounded research call is refused when remaining target budget cannot cover it", () => {
  const call = estimateCallUsd({ inputChars: 8000, maxTokens: 2500, maxSearches: 4 });
  assert.equal(canAffordCall(TARGET_DISCOVERY_USD - 0.01, call), false);
  assert.equal(canAffordCall(0, call), call <= TARGET_DISCOVERY_USD);
});

test("sector filter matches the free-text sector strings extraction actually writes", () => {
  // The results-page filter bar used to do an exact string match against
  // events.sector, which is free text like this — never one of the 10
  // canonical sector ids — so picking "Financial services" in the filter
  // almost never matched anything real. sectorMatches (shared with
  // search-time validation) fixes that.
  assert.ok(sectorMatches("Financial Services - Anti-Fraud/Forensic Accounting", "financial_services"));
  assert.ok(sectorMatches("Healthcare Finance / Medical Group Management", "healthcare"));
  assert.ok(sectorMatches("Enterprise Analytics / AI", "technology"));
  assert.ok(!sectorMatches("Enterprise Analytics / AI", "healthcare"));
});

test("custom criteria keep an explicit query", () => {
  const parsed = parseCriteria({ sectors: ["technology"], customQuery: "SaaS founder panels 2027", types: ["panel"] });
  assert.equal(parsed.customQuery, "SaaS founder panels 2027");
});

test("guided criteria produce an official-source-focused research query", () => {
  const window = defaultDateWindow(new Date("2026-09-22T00:00:00Z"));
  const query = buildResearchQuery({
    sectors: ["healthcare"],
    location: "Chicago",
    ...window,
    types: ["conference"],
    expertise: "hospital leadership",
    audience: "health-system executives",
  });
  assert.match(query, /Healthcare & life sciences/);
  assert.match(query, /official call-for-speakers/i);
  assert.match(query, /Chicago/);
});

test("Stripe test-mode secret validation rejects live keys without retrieving prices", () => {
  assert.throws(() => assertStripeSecretIsTestMode("sk_live_example"), StripeConfigError);
  assert.doesNotThrow(() => assertStripeSecretIsTestMode("sk_test_example"));
});

test("discovery eligibility excludes trial contact credits after the free search is used", () => {
  assert.equal(canStartDiscovery(0, 1), true);
  assert.equal(canStartDiscovery(0, 0), false);
  assert.equal(canStartDiscovery(20, 0), true);
  const contactOnlyTrialBalance = getNonTrialCreditBalance({
    subscription: 0,
    rollover: 0,
    manual: 0,
  });
  assert.equal(contactOnlyTrialBalance, 0);
  assert.equal(canStartDiscovery(contactOnlyTrialBalance, 0), false);
});

test("recovery resumes fallback extraction when research exists without extracted events", () => {
  assert.equal(
    shouldResumeFallbackExtraction(
      { findings: "Useful alternate-source research" },
      undefined
    ),
    true
  );
  assert.equal(
    shouldResumeFallbackExtraction(
      { findings: "Useful alternate-source research" },
      { events: [] }
    ),
    false
  );
});

test("recovery reuses completed contact research instead of calling the provider", () => {
  assert.equal(shouldReuseContactResearch("completed", undefined), true);
  assert.equal(shouldReuseContactResearch("charged", { contacts: [] }), true);
  assert.equal(shouldReuseContactResearch("charged", undefined), false);
  assert.equal(shouldReuseContactResearch("refunded", { contacts: [] }), false);
});

test("terminal polling refreshes results while active polling continues", () => {
  let refreshed = 0;
  let continued = 0;
  const actions = {
    onTerminal: () => {
      refreshed += 1;
    },
    onContinue: () => {
      continued += 1;
    },
  };
  handleDiscoveryPollStatus("running", actions);
  handleDiscoveryPollStatus("completed", actions);
  assert.equal(continued, 1);
  assert.equal(refreshed, 1);
});

test("both extraction attempts report usage even when structured extraction fails", async () => {
  const recorded: number[] = [];
  let attempts = 0;
  await assert.rejects(
    extractEvents({
      findings: "Candidate findings",
      sector: "healthcare",
      discoveryQuery: "healthcare conferences",
      beforeRetry: () => true,
      onUsage: (usage) => {
        recorded.push(usage.estimatedCostUsd);
      },
      request: async () => {
        attempts += 1;
        return {
          content: [{ type: "text" }],
          stop_reason: attempts === 1 ? "max_tokens" : "end_turn",
          usage: { input_tokens: 100 * attempts, output_tokens: 50 * attempts },
        };
      },
    }),
    ExtractionFailureError
  );
  assert.equal(attempts, 2);
  assert.equal(recorded.length, 2);
  assert.ok(recorded.every((cost) => cost > 0));
});

test("a malformed (non-array) events field is retried once, not failed outright", async () => {
  let attempts = 0;
  const result = await extractEvents({
    findings: "Candidate findings",
    sector: "healthcare",
    discoveryQuery: "healthcare conferences",
    beforeRetry: () => true,
    request: async () => {
      attempts += 1;
      return {
        content: [
          {
            type: "tool_use",
            input: attempts === 1 ? { events: {} } : { events: [{ sector: "healthcare", event_name: "Real Summit", status: "open" }] },
          },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      };
    },
  });
  assert.equal(attempts, 2, "a malformed events field triggers exactly one corrective retry");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].event_name, "Real Summit");
});

test("extraction retry is blocked before a second provider call when budget is exhausted", async () => {
  let attempts = 0;
  await assert.rejects(
    extractEvents({
      findings: "Candidate findings",
      sector: "healthcare",
      discoveryQuery: "healthcare conferences",
      beforeRetry: () => false,
      request: async () => {
        attempts += 1;
        return {
          content: [{ type: "text" }],
          stop_reason: "max_tokens",
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      },
    }),
    /remaining provider budget/
  );
  assert.equal(attempts, 1);
});
