import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  failExhaustedJobs,
  processDiscoveryRun,
  UnresolvedChargeError,
  type DiscoveryProviders,
} from "../src/lib/discovery";
import { CREDIT_COSTS } from "../src/lib/credits";
import { createFakeSupabase, type FakeSupabase, type Row } from "./helpers/fakeSupabase";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const LEASE_TOKEN = "33333333-3333-3333-3333-333333333333";
const OPERATION_KEY = "op-key";

const day = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

const criteria = {
  sectors: ["healthcare"],
  location: "",
  dateFrom: day(0),
  dateTo: day(365),
  types: ["conference"],
  expertise: "",
  audience: "",
};

function openEvent(name: string, id: string) {
  return {
    id,
    sector: "healthcare",
    event_name: name,
    opportunity_type: "conference",
    event_start: day(90),
    source_url: `https://example.com/${id}`,
    booking_path: "Submit a proposal via the CFP page",
    status: "open" as const,
  };
}

function baseTables(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    profiles: [{ id: PROFILE_ID, role: "member", access_status: "active" }],
    discovery_runs: [
      {
        id: RUN_ID,
        profile_id: PROFILE_ID,
        operation_key: OPERATION_KEY,
        sector: "healthcare",
        query: "healthcare conferences",
        status: "running",
        max_auto_contact_lookups: 7,
        billing_mode: "customer_credits",
        current_stage: "validation",
        last_completed_stage: "extraction",
        criteria,
        stage_summaries: [],
        citations: [],
        estimated_cost_usd: 0,
        extraction_truncated: false,
        displayed_credit_cap: CREDIT_COSTS.discovery + 7 * CREDIT_COSTS.enrichment,
      },
    ],
    discovery_jobs: [
      { id: "job-1", run_id: RUN_ID, lease_token: LEASE_TOKEN, status: "running", last_error: null as string | null },
    ],
    discovery_run_artifacts: [
      { id: "artifact-research", run_id: RUN_ID, stage: "research", payload: { findings: "Prior research findings", citations: [] } },
    ],
    ...overrides,
  };
}

/**
 * The state left by a crash after the contact debit but before anything was
 * saved: a charged operation, no artifact, no contact rows, no balance left.
 */
function chargedSeed(event: ReturnType<typeof openEvent>, enrichmentKey: string) {
  return baseTables({
    events: [event],
    discovery_run_artifacts: [
      { id: "artifact-research", run_id: RUN_ID, stage: "research", payload: { findings: "Prior research findings", citations: [] } },
      { id: "artifact-extraction", run_id: RUN_ID, stage: "extraction", payload: { events: [event], truncated: false } },
    ],
    credit_ledger: [
      { id: "grant", profile_id: PROFILE_ID, delta: 40, reason: "monthly_grant", balance_bucket: "subscription" },
      { id: "debit-discovery", profile_id: PROFILE_ID, delta: -20, reason: "discovery_usage", balance_bucket: "subscription" },
      { id: "debit-contact", profile_id: PROFILE_ID, delta: -20, reason: "enrichment_usage", balance_bucket: "subscription" },
    ],
    credit_operations: [
      { id: "op-discovery", operation_key: `${OPERATION_KEY}:discovery`, profile_id: PROFILE_ID, amount: 20, status: "charged" },
      { id: "op-contact", operation_key: enrichmentKey, profile_id: PROFILE_ID, amount: 20, status: "charged" },
    ],
  });
}

function providers(overrides: Partial<DiscoveryProviders> = {}): DiscoveryProviders {
  return {
    researchCategory: async () => {
      throw new Error("researchCategory must not be called in this scenario");
    },
    extractEvents: async () => {
      throw new Error("extractEvents must not be called in this scenario");
    },
    enrichAndSaveContacts: async () => {
      throw new Error("enrichAndSaveContacts must not be called in this scenario");
    },
    ...overrides,
  } as DiscoveryProviders;
}

const asClient = (fake: FakeSupabase) => fake as unknown as SupabaseClient;

test("a resumed run keeps contact research already charged even with a zero balance", async () => {
  const paidEvent = openEvent("Paid Health Summit", "event-paid");
  const unpaidEvent = openEvent("Unpaid Health Forum", "event-unpaid");
  const savedContact = { id: "contact-1", event_id: paidEvent.id, name: "Dana Speaker", email: "dana@example.com" };
  const enrichmentKey = `${OPERATION_KEY}:enrichment:${paidEvent.id}`;

  const fake = createFakeSupabase(
    baseTables({
      events: [paidEvent, unpaidEvent],
      contacts: [savedContact],
      discovery_run_artifacts: [
        { id: "artifact-research", run_id: RUN_ID, stage: "research", payload: { findings: "Prior research findings", citations: [] } },
        {
          id: "artifact-extraction",
          run_id: RUN_ID,
          stage: "extraction",
          payload: { events: [paidEvent, unpaidEvent], truncated: false },
        },
        {
          id: "artifact-contacts",
          run_id: RUN_ID,
          stage: `enrichment:${paidEvent.id}`,
          payload: { contacts: [savedContact] },
        },
      ],
      // The discovery charge and one contact charge already consumed the balance.
      credit_ledger: [
        { id: "grant", profile_id: PROFILE_ID, delta: 40, reason: "monthly_grant", balance_bucket: "subscription" },
        { id: "debit-discovery", profile_id: PROFILE_ID, delta: -20, reason: "discovery_usage", balance_bucket: "subscription" },
        { id: "debit-contact", profile_id: PROFILE_ID, delta: -20, reason: "enrichment_usage", balance_bucket: "subscription" },
      ],
      credit_operations: [
        { id: "op-discovery", operation_key: `${OPERATION_KEY}:discovery`, profile_id: PROFILE_ID, amount: 20, status: "charged" },
        { id: "op-contact", operation_key: enrichmentKey, profile_id: PROFILE_ID, amount: 20, status: "charged" },
      ],
    })
  );

  const result = await processDiscoveryRun(asClient(fake), RUN_ID, LEASE_TOKEN, providers());

  assert.equal(result.contactsFound, 1, "contacts already paid for must be returned");
  assert.equal(result.creditsUsed, CREDIT_COSTS.discovery + CREDIT_COSTS.enrichment);

  const run = fake.tables.discovery_runs[0];
  assert.equal(run.contacts_found, 1);
  assert.equal(run.contact_lookups_attempted, 1);
  assert.equal(run.credits_charged, CREDIT_COSTS.discovery + CREDIT_COSTS.enrichment);
  // The second, unpaid event is still correctly withheld for lack of credits.
  assert.equal(run.status, "partial");
  assert.equal(result.enrichmentSkippedForCredits, true);

  // No second debit, and the earlier charge is settled rather than left open.
  assert.equal(fake.balanceOf(PROFILE_ID), 0);
  assert.equal(fake.operationStatus(enrichmentKey), "completed");
  assert.equal(fake.operationStatus(`${OPERATION_KEY}:discovery`), "completed");
  assert.equal(fake.rpcCalls.filter((call) => call.name === "debit_credits_v2").length, 0);
  assert.equal(fake.rpcCalls.filter((call) => call.name === "refund_credit_operation").length, 0);
});

test("paid contacts recorded only as ownership links are recovered before affordability limits", async () => {
  const paidEvent = openEvent("Recovered Health Summit", "event-recovered");
  const savedContact = { id: "contact-2", event_id: paidEvent.id, name: "Ari Organizer", email: "ari@example.com" };
  const enrichmentKey = `${OPERATION_KEY}:enrichment:${paidEvent.id}`;

  const fake = createFakeSupabase(
    baseTables({
      events: [paidEvent],
      contacts: [savedContact],
      customer_event_contacts: [
        { id: "link-1", profile_id: PROFILE_ID, event_id: paidEvent.id, contact_id: savedContact.id, discovery_run_id: RUN_ID },
      ],
      discovery_run_artifacts: [
        { id: "artifact-research", run_id: RUN_ID, stage: "research", payload: { findings: "Prior research findings", citations: [] } },
        { id: "artifact-extraction", run_id: RUN_ID, stage: "extraction", payload: { events: [paidEvent], truncated: false } },
      ],
      credit_ledger: [
        { id: "grant", profile_id: PROFILE_ID, delta: 40, reason: "monthly_grant", balance_bucket: "subscription" },
        { id: "debit-discovery", profile_id: PROFILE_ID, delta: -20, reason: "discovery_usage", balance_bucket: "subscription" },
        { id: "debit-contact", profile_id: PROFILE_ID, delta: -20, reason: "enrichment_usage", balance_bucket: "subscription" },
      ],
      credit_operations: [
        { id: "op-discovery", operation_key: `${OPERATION_KEY}:discovery`, profile_id: PROFILE_ID, amount: 20, status: "charged" },
        { id: "op-contact", operation_key: enrichmentKey, profile_id: PROFILE_ID, amount: 20, status: "completed" },
      ],
    })
  );

  const result = await processDiscoveryRun(asClient(fake), RUN_ID, LEASE_TOKEN, providers());

  assert.equal(result.contactsFound, 1);
  assert.equal(result.status, "completed");
  assert.equal(fake.balanceOf(PROFILE_ID), 0);
  assert.equal(fake.rpcCalls.filter((call) => call.name === "debit_credits_v2").length, 0);
  const rebuilt = fake.tables.discovery_run_artifacts.find((row) => row.stage === `enrichment:${paidEvent.id}`);
  assert.ok(rebuilt, "recovered contacts are saved for the next attempt");
});

test("a charge taken before the crash is finished without a second debit at zero balance", async () => {
  const chargedEvent = openEvent("Interrupted Health Summit", "event-interrupted");
  const enrichmentKey = `${OPERATION_KEY}:enrichment:${chargedEvent.id}`;

  const fake = createFakeSupabase(chargedSeed(chargedEvent, enrichmentKey));
  let contactCalls = 0;
  const result = await processDiscoveryRun(
    asClient(fake),
    RUN_ID,
    LEASE_TOKEN,
    providers({
      enrichAndSaveContacts: async () => {
        contactCalls += 1;
        return [{ id: "contact-4", event_id: chargedEvent.id, name: "Sam Producer", email: "sam@example.com" }] as never;
      },
    })
  );

  assert.equal(contactCalls, 1, "unfinished paid work is completed, not skipped");
  assert.equal(result.contactsFound, 1);
  assert.equal(result.status, "completed");
  assert.equal(fake.tables.discovery_runs[0].contacts_found, 1);
  assert.equal(fake.tables.discovery_runs[0].contact_lookups_attempted, 1);
  assert.equal(fake.tables.discovery_runs[0].credits_charged, CREDIT_COSTS.discovery + CREDIT_COSTS.enrichment);
  assert.equal(fake.operationStatus(enrichmentKey), "completed", "the open charge is settled");
  assert.equal(fake.balanceOf(PROFILE_ID), 0, "the customer is not debited twice");
  assert.equal(fake.rpcCalls.filter((call) => call.name === "debit_credits_v2").length, 0);

  // If the retried lookup fails, the existing charge is genuinely refunded.
  const failing = createFakeSupabase(chargedSeed(chargedEvent, enrichmentKey));
  const failedResult = await processDiscoveryRun(
    asClient(failing),
    RUN_ID,
    LEASE_TOKEN,
    providers({
      enrichAndSaveContacts: async () => {
        throw new Error("provider unavailable");
      },
    })
  );

  assert.equal(failedResult.contactsFound, 0);
  assert.equal(failedResult.contactLookupsFailed, 1);
  assert.equal(failing.operationStatus(enrichmentKey), "refunded");
  assert.equal(failing.balanceOf(PROFILE_ID), CREDIT_COSTS.enrichment, "the unusable contact charge is returned");
  assert.equal(failing.tables.discovery_runs[0].credits_charged, CREDIT_COSTS.discovery);
  assert.equal(failing.tables.discovery_runs[0].status, "partial");
});

test("a database failure while recovering a charge refunds it rather than reporting a free failure", async () => {
  const chargedEvent = openEvent("Unreadable Health Summit", "event-unreadable");
  const enrichmentKey = `${OPERATION_KEY}:enrichment:${chargedEvent.id}`;

  const fake = createFakeSupabase(chargedSeed(chargedEvent, enrichmentKey), {
    // The saved-contact lookup fails, mid-recovery, on an existing charge.
    query: (table) => (table === "customer_event_contacts" ? "connection reset while reading contacts" : null),
  });

  const result = await processDiscoveryRun(asClient(fake), RUN_ID, LEASE_TOKEN, providers());

  assert.equal(result.contactLookupsFailed, 1);
  assert.equal(result.contactsFound, 0);
  assert.equal(fake.operationStatus(enrichmentKey), "refunded", "the charge is not left open");
  assert.equal(fake.balanceOf(PROFILE_ID), CREDIT_COSTS.enrichment);
  const run = fake.tables.discovery_runs[0];
  assert.equal(run.credits_charged, CREDIT_COSTS.discovery, "the summary excludes the refunded lookup");
  assert.match(String(run.error_message), /not charged/);
  assert.equal(run.status, "partial");
});

test("a charge that can be neither delivered nor refunded leaves the run claimable", async () => {
  const chargedEvent = openEvent("Unsettled Health Summit", "event-unsettled");
  const enrichmentKey = `${OPERATION_KEY}:enrichment:${chargedEvent.id}`;

  const fake = createFakeSupabase(chargedSeed(chargedEvent, enrichmentKey), {
    query: (table) => (table === "customer_event_contacts" ? "connection reset while reading contacts" : null),
    rpc: (name) => (name === "refund_credit_operation" ? "connection reset while refunding" : null),
  });

  await assert.rejects(
    processDiscoveryRun(asClient(fake), RUN_ID, LEASE_TOKEN, providers()),
    UnresolvedChargeError
  );

  const run = fake.tables.discovery_runs[0];
  assert.equal(run.status, "running", "the run is not closed over an unresolved charge");
  assert.notEqual(run.current_stage, "done");
  assert.equal(run.completed_at, undefined);
  assert.equal(fake.operationStatus(enrichmentKey), "charged");
  // Still claimable: the job keeps running until its lease expires and a later
  // attempt settles the charge, or retry exhaustion refunds it.
  assert.equal(fake.tables.discovery_jobs[0].status, "running");
});

test("retry exhaustion records confirmed refunds from earlier attempts, not only this invocation", async () => {
  const chargedEvent = openEvent("Retried Health Summit", "event-retried");
  const enrichmentKey = `${OPERATION_KEY}:enrichment:${chargedEvent.id}`;
  const tables = chargedSeed(chargedEvent, enrichmentKey);
  tables.discovery_jobs = [
    { id: "job-1", run_id: RUN_ID, lease_token: LEASE_TOKEN, status: "failed", last_error: "retry_exhausted" },
  ];

  let contactRefundAttempts = 0;
  const fake = createFakeSupabase(tables, {
    rpc: (name, args) => {
      if (name === "refund_credit_operation" && String(args.p_operation_key).includes(":enrichment:")) {
        contactRefundAttempts += 1;
        if (contactRefundAttempts === 1) return "contact refund temporarily failed";
      }
      return null;
    },
  });

  await assert.rejects(failExhaustedJobs(asClient(fake)), /contact refund temporarily failed/);
  assert.equal(fake.operationStatus(`${OPERATION_KEY}:discovery`), "refunded");
  assert.equal(fake.operationStatus(enrichmentKey), "charged");
  assert.equal(fake.tables.discovery_runs[0].status, "running");
  assert.equal(fake.balanceOf(PROFILE_ID), CREDIT_COSTS.enrichment);

  await failExhaustedJobs(asClient(fake));

  assert.equal(fake.operationStatus(`${OPERATION_KEY}:discovery`), "refunded");
  assert.equal(fake.operationStatus(enrichmentKey), "refunded");
  assert.equal(fake.balanceOf(PROFILE_ID), 40, "both charges return to the ledger once");
  const refundRows = fake.tables.credit_ledger.filter((row) => row.reason === "usage_refund");
  assert.equal(refundRows.length, 2, "already-refunded operations are not refunded again");
  assert.equal(
    refundRows.reduce((sum, row) => sum + Number(row.delta), 0),
    CREDIT_COSTS.discovery + CREDIT_COSTS.enrichment
  );
  const run = fake.tables.discovery_runs[0];
  assert.equal(run.status, "refunded");
  assert.equal(run.credits_refunded, CREDIT_COSTS.discovery + CREDIT_COSTS.enrichment);
});

test("retry exhaustion refunds outstanding contact charges, not only the search charge", async () => {
  const chargedEvent = openEvent("Abandoned Health Summit", "event-abandoned");
  const enrichmentKey = `${OPERATION_KEY}:enrichment:${chargedEvent.id}`;
  const tables = chargedSeed(chargedEvent, enrichmentKey);
  tables.discovery_jobs = [
    { id: "job-1", run_id: RUN_ID, lease_token: LEASE_TOKEN, status: "failed", last_error: "retry_exhausted" },
  ];

  const fake = createFakeSupabase(tables);
  await failExhaustedJobs(asClient(fake));

  assert.equal(fake.operationStatus(`${OPERATION_KEY}:discovery`), "refunded");
  assert.equal(fake.operationStatus(enrichmentKey), "refunded");
  assert.equal(fake.balanceOf(PROFILE_ID), 40, "both charges return to the ledger");
  const run = fake.tables.discovery_runs[0];
  assert.equal(run.status, "refunded");
  assert.equal(run.credits_refunded, CREDIT_COSTS.discovery + CREDIT_COSTS.enrichment);
});

test("a fresh run refunds when fallback research completes but its extraction cannot be afforded", async () => {
  const closedEvent = {
    sector: "healthcare",
    event_name: "Closed Health Summit",
    opportunity_type: "conference",
    event_start: day(90),
    source_url: "https://example.com/closed",
    booking_path: "Call for speakers closed; no longer accepting proposals",
    status: "open" as const,
  };

  const tables = baseTables({
    discovery_run_artifacts: [
      { id: "artifact-research", run_id: RUN_ID, stage: "research", payload: { findings: "Prior research findings", citations: [] } },
      { id: "artifact-extraction", run_id: RUN_ID, stage: "extraction", payload: { events: [closedEvent], truncated: false } },
    ],
    credit_ledger: [
      { id: "grant", profile_id: PROFILE_ID, delta: 100, reason: "monthly_grant", balance_bucket: "subscription" },
      { id: "debit-discovery", profile_id: PROFILE_ID, delta: -20, reason: "discovery_usage", balance_bucket: "subscription" },
    ],
    credit_operations: [
      { id: "op-discovery", operation_key: `${OPERATION_KEY}:discovery`, profile_id: PROFILE_ID, amount: 20, status: "charged" },
    ],
  });
  // Enough remaining budget for the fallback search to be attempted, but its
  // real cost (below) overruns what was estimated, leaving too little for
  // the extraction that has to follow it. Numbers sized for the $2.00
  // runaway-cost safety ceiling (24 Sep 2026) — this is deliberately a
  // pathological case (a fallback costing far more than modeled), not a
  // realistic everyday search.
  tables.discovery_runs[0].estimated_cost_usd = 1.8;

  const fake = createFakeSupabase(tables);
  let fallbackCalls = 0;

  await assert.rejects(
    processDiscoveryRun(
      asClient(fake),
      RUN_ID,
      LEASE_TOKEN,
      providers({
        researchCategory: async () => {
          fallbackCalls += 1;
          return {
            findings: "Alternate-source findings",
            citations: ["https://example.com/alternate"],
            usage: {
              inputTokens: 40000,
              outputTokens: 3000,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens: 0,
              webSearchRequests: 2,
              estimatedCostUsd: 0.25,
            },
            stopReason: "end_turn",
            truncated: false,
          };
        },
      })
    ),
    /budget_exhausted/
  );

  assert.equal(fallbackCalls, 1, "fallback research runs before the budget is exhausted");
  const run = fake.tables.discovery_runs[0];
  assert.equal(run.status, "refunded", "an unusable paid fallback is not billed as an empty search");
  assert.equal(run.failure_class, "budget_exhausted");
  assert.equal(run.credits_refunded, CREDIT_COSTS.discovery);
  assert.equal(fake.operationStatus(`${OPERATION_KEY}:discovery`), "refunded");
  assert.equal(fake.balanceOf(PROFILE_ID), 100, "the discovery charge is returned to the ledger");
  assert.equal(fake.tables.discovery_jobs[0].status, "failed");
});

test("a resumed run finishes unextracted fallback research and charges for the results", async () => {
  const foundEvent = openEvent("Fallback Health Summit", "event-fallback");

  const fake = createFakeSupabase(
    baseTables({
      discovery_run_artifacts: [
        { id: "artifact-research", run_id: RUN_ID, stage: "research", payload: { findings: "Prior research findings", citations: [] } },
        { id: "artifact-extraction", run_id: RUN_ID, stage: "extraction", payload: { events: [], truncated: false } },
        {
          id: "artifact-fallback",
          run_id: RUN_ID,
          stage: "fallback_research",
          payload: { findings: "Alternate-source findings saved before the restart", citations: [] },
        },
      ],
      credit_ledger: [
        { id: "grant", profile_id: PROFILE_ID, delta: 100, reason: "monthly_grant", balance_bucket: "subscription" },
        { id: "debit-discovery", profile_id: PROFILE_ID, delta: -20, reason: "discovery_usage", balance_bucket: "subscription" },
      ],
      credit_operations: [
        { id: "op-discovery", operation_key: `${OPERATION_KEY}:discovery`, profile_id: PROFILE_ID, amount: 20, status: "charged" },
      ],
    })
  );

  const result = await processDiscoveryRun(
    asClient(fake),
    RUN_ID,
    LEASE_TOKEN,
    providers({
      extractEvents: async () => ({
        events: [foundEvent],
        usage: {
          inputTokens: 500,
          outputTokens: 500,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          webSearchRequests: 0,
          estimatedCostUsd: 0.02,
        },
        truncated: false,
        stopReason: "end_turn",
      }),
      enrichAndSaveContacts: async () => [
        { id: "contact-3", event_id: "event-fallback", name: "Jo Chair", email: "jo@example.com" },
      ] as never,
    })
  );

  assert.equal(result.inserted, 1, "the saved fallback research is not discarded");
  assert.equal(result.contactsFound, 1);
  assert.equal(result.status, "completed");
  assert.equal(fake.balanceOf(PROFILE_ID), 100 - CREDIT_COSTS.discovery - CREDIT_COSTS.enrichment);
  assert.equal(fake.tables.discovery_runs[0].credits_charged, CREDIT_COSTS.discovery + CREDIT_COSTS.enrichment);
});

test("truncated extraction with real related results is kept, not failed and refunded", async () => {
  // Truncation only means the events array may be missing trailing items —
  // anything that DID parse is a complete, validly classified object. Failing
  // the whole search just because none of what parsed happened to be "exact"
  // discards real, usable related suggestions for no reason.
  const relatedEvent = { ...openEvent("Related Health Forum", "event-related"), source_url: null };

  const fake = createFakeSupabase(
    baseTables({
      credit_ledger: [
        { id: "grant", profile_id: PROFILE_ID, delta: 40, reason: "monthly_grant", balance_bucket: "subscription" },
        { id: "debit-discovery", profile_id: PROFILE_ID, delta: -20, reason: "discovery_usage", balance_bucket: "subscription" },
      ],
      credit_operations: [
        { id: "op-discovery", operation_key: `${OPERATION_KEY}:discovery`, profile_id: PROFILE_ID, amount: 20, status: "charged" },
      ],
    })
  );

  const result = await processDiscoveryRun(
    asClient(fake),
    RUN_ID,
    LEASE_TOKEN,
    providers({
      // classified.exact.length === 0 also triggers the (separate, already
      // fixed) fallback-research retry regardless of related results, so
      // that path needs a real provider here too — not what this test is
      // about, just a consequence of exact being empty.
      researchCategory: async () => ({
        findings: "Fallback findings",
        citations: [],
        usage: {
          inputTokens: 500,
          outputTokens: 500,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          webSearchRequests: 2,
          estimatedCostUsd: 0.05,
        },
        stopReason: "end_turn",
        truncated: false,
      }),
      extractEvents: async () => ({
        events: [relatedEvent],
        usage: {
          inputTokens: 500,
          outputTokens: 500,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          webSearchRequests: 0,
          estimatedCostUsd: 0.02,
        },
        truncated: true,
        stopReason: "max_tokens",
      }),
      enrichAndSaveContacts: async () => [] as never,
    })
  );

  assert.notEqual(result.status, "failed", "a real related suggestion must not be discarded as a failure");
  assert.notEqual(result.status, "refunded");
  assert.equal(result.relatedEvents?.length, 1, "the related suggestion is persisted and shown (deduped across passes)");
});

test("a truncated research pass runs fallback research even when it already found an exact match", async () => {
  // A broad multi-sector/multi-type query can get its own research response
  // cut off by the output-token ceiling before covering everything asked for
  // (e.g. it announces it will research podcasts, then never gets there).
  // Live evaluation (24 Sep 2026) showed the run stopping anyway once it had
  // one exact match, silently never finishing the rest of the request.
  const foundEvent = openEvent("Already Found Summit", "event-found");
  const fallbackEvent = openEvent("Second Pass Podcast Summit", "event-fallback-found");
  let researchCalls = 0;
  let extractionCalls = 0;

  const fake = createFakeSupabase(
    baseTables({
      discovery_run_artifacts: [
        {
          id: "artifact-research",
          run_id: RUN_ID,
          stage: "research",
          payload: { findings: "Prior research findings, cut off mid-answer", citations: [], truncated: true },
        },
      ],
    })
  );

  const result = await processDiscoveryRun(
    asClient(fake),
    RUN_ID,
    LEASE_TOKEN,
    providers({
      researchCategory: async () => {
        researchCalls += 1;
        return {
          findings: "Fallback findings covering what the truncated pass missed",
          citations: ["https://example.com/fallback"],
          usage: {
            inputTokens: 1000,
            outputTokens: 1000,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            webSearchRequests: 2,
            estimatedCostUsd: 0.06,
          },
          stopReason: "end_turn",
          truncated: false,
        };
      },
      extractEvents: async () => {
        extractionCalls += 1;
        return {
          events: extractionCalls === 1 ? [foundEvent] : [fallbackEvent],
          usage: {
            inputTokens: 500,
            outputTokens: 500,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            webSearchRequests: 0,
            estimatedCostUsd: 0.02,
          },
          truncated: false,
          stopReason: "end_turn",
        };
      },
      enrichAndSaveContacts: async () => [] as never,
    })
  );

  assert.equal(researchCalls, 1, "fallback research runs despite already having an exact match");
  assert.equal(extractionCalls, 2, "both the initial and fallback findings get extracted");
  assert.equal(result.inserted, 2, "results from both passes are kept, not just the first");
  assert.notEqual(result.status, "no_matches", "the exact match already found is not discarded");
});
