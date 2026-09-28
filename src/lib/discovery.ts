import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ExtractionBudgetError,
  ExtractionFailureError,
  extractEvents,
  researchCategory,
  type AgentUsage,
} from "@/lib/agent";
import { recordAiUsage, type AiAction } from "@/lib/aiUsage";
import { enrichAndSaveContacts } from "@/lib/enrichment";
import { maybeSendTrialCompleteEmail } from "@/lib/email/notify";
import {
  CREDIT_COSTS,
  completeCreditOperation,
  getCreditBalance,
  getUsageEntitlement,
  InsufficientCreditsError,
  refundUsageCredits,
  requireAndDebitCredits,
} from "@/lib/credits";
import {
  canAffordCall,
  estimateCallUsd,
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_RETRY_MAX_TOKENS,
  FALLBACK_MAX_SEARCHES,
  FALLBACK_MAX_TOKENS,
  RESEARCH_MAX_SEARCHES,
  RESEARCH_MAX_TOKENS,
  RESEARCH_PROMPT_OVERHEAD_CHARS,
  remainingDiscoveryBudget,
  TARGET_DISCOVERY_USD,
  trimFindings,
} from "@/lib/providerBudget";
import { classifyValidated, validateOpportunity, type ValidatedOpportunity } from "@/lib/opportunityValidation";
import { buildResearchQuery, parseCriteria, type SearchCriteria } from "@/lib/searchCriteria";
import {
  isContactResearchCharged,
  shouldResumeFallbackExtraction,
  shouldReuseContactResearch,
  type CreditOperationStatus,
} from "@/lib/discoveryRecovery";
import type { ContactRecord, EventInput, EventRecord } from "@/types/event";

export interface DiscoveryResult {
  inserted: number;
  contactsFound: number;
  citations: string[];
  events: EventRecord[];
  relatedEvents?: EventRecord[];
  runId: string;
  creditsUsed: number;
  billingMode: "customer_credits" | "owner_unbilled";
  contactLookupsFailed: number;
  enrichmentSkippedForCredits: boolean;
  status?: string;
  currentStage?: string;
}

type StageName =
  | "queued"
  | "research"
  | "fallback_research"
  | "extraction"
  | "validation"
  | "persist"
  | "enrichment"
  | "done";

interface RunRow {
  id: string;
  profile_id: string;
  operation_key: string | null;
  sector: string;
  query: string;
  status: string;
  max_auto_contact_lookups: number;
  billing_mode: "customer_credits" | "owner_unbilled";
  current_stage: StageName;
  last_completed_stage: StageName | null;
  criteria: SearchCriteria | Record<string, unknown>;
  stage_summaries: unknown[];
  citations: string[];
  estimated_cost_usd: number;
  extraction_truncated: boolean;
  displayed_credit_cap: number | null;
}

interface ClaimedDiscoveryJob {
  run_id: string;
  lease_token: string;
}

/**
 * Provider calls are injectable so the worker's recovery and billing paths can
 * be exercised end to end without spending provider budget. Production callers
 * use the defaults.
 */
export interface DiscoveryProviders {
  researchCategory: typeof researchCategory;
  extractEvents: typeof extractEvents;
  enrichAndSaveContacts: typeof enrichAndSaveContacts;
}

const defaultProviders: DiscoveryProviders = {
  researchCategory,
  extractEvents,
  enrichAndSaveContacts,
};

class DiscoveryLeaseLostError extends Error {
  constructor(runId: string) {
    super(`Discovery lease lost for run ${runId}`);
    this.name = "DiscoveryLeaseLostError";
  }
}

/**
 * Raised when a contact charge can be neither delivered nor refunded, usually
 * because the database itself is failing. The run is left claimable so a later
 * attempt can settle the charge, rather than being closed over an open debit.
 */
export class UnresolvedChargeError extends Error {
  constructor(public operationKey: string, public cause: unknown) {
    super(`Contact charge ${operationKey} could not be settled or refunded`);
    this.name = "UnresolvedChargeError";
  }
}

export async function enqueueDiscovery(
  supabase: SupabaseClient,
  params: {
    sector: string;
    query: string;
    profileId: string;
    maxAutoContactLookups?: number;
    operationKey?: string;
    criteria?: SearchCriteria;
    scheduleId?: string;
  }
): Promise<{ runId: string; status: string; billingMode: string; duplicate?: boolean }> {
  const lookupCap = Math.max(0, Math.min(10, params.maxAutoContactLookups ?? 7));
  const displayedCreditCap = CREDIT_COSTS.discovery + lookupCap * CREDIT_COSTS.enrichment;
  const { data, error } = await supabase.rpc("enqueue_discovery_run", {
    p_profile_id: params.profileId,
    p_sector: params.sector,
    p_query: params.query,
    p_operation_key: params.operationKey ?? crypto.randomUUID(),
    p_max_auto_contact_lookups: lookupCap,
    p_criteria: params.criteria ?? {},
    p_displayed_credit_cap: displayedCreditCap,
    p_schedule_id: params.scheduleId ?? null,
  });
  if (error) throw new Error(error.message);
  const result = data as {
    status?: string;
    run_id?: string;
    billing_mode?: string;
    balance?: number;
    required?: number;
    duplicate?: boolean;
  };
  if (result.status === "insufficient") {
    throw new InsufficientCreditsError(result.balance ?? 0, result.required ?? CREDIT_COSTS.discovery);
  }
  if (!result.run_id) throw new Error("Discovery enqueue did not return a run id");
  return {
    runId: result.run_id,
    status: result.status ?? "queued",
    billingMode: result.billing_mode ?? "customer_credits",
    duplicate: result.duplicate,
  };
}

export async function processQueuedDiscoveryJobs(supabase: SupabaseClient, limit = 2): Promise<number> {
  await failExhaustedJobs(supabase);
  let processed = 0;
  // Claim immediately before processing. Claiming a batch and then processing
  // sequentially lets later jobs expire before their heartbeat has started.
  while (processed < limit) {
    const { data: jobs, error } = await supabase.rpc("claim_discovery_job", { p_limit: 1 });
    if (error) throw new Error(error.message);
    const job = ((jobs ?? []) as ClaimedDiscoveryJob[])[0];
    if (!job) break;
    await processDiscoveryRun(supabase, job.run_id, job.lease_token);
    processed += 1;
  }
  return processed;
}

export async function claimAndProcessDiscoveryRun(
  supabase: SupabaseClient,
  runId: string
): Promise<DiscoveryResult | null> {
  await failExhaustedJobs(supabase);
  const { data: claimed, error } = await supabase.rpc("claim_discovery_job_for_run", {
    p_run_id: runId,
  });
  if (error) throw new Error(error.message);
  if (!claimed) return null;
  const job = claimed as ClaimedDiscoveryJob;
  return processDiscoveryRun(supabase, runId, job.lease_token);
}

export async function failExhaustedJobs(supabase: SupabaseClient) {
  const { data: jobs } = await supabase
    .from("discovery_jobs")
    .select("run_id, last_error")
    .eq("status", "failed")
    .eq("last_error", "retry_exhausted");
  for (const job of jobs ?? []) {
    const { data: run } = await supabase
      .from("discovery_runs")
      .select("id, status, operation_key, billing_mode")
      .eq("id", job.run_id)
      .maybeSingle();
    if (!run || ["failed", "refunded", "completed", "no_matches", "partial"].includes(run.status)) continue;
    const operationKey = String(run.operation_key ?? run.id);
    await failRun(supabase, run.id, operationKey, run.billing_mode === "owner_unbilled", "retry_exhausted", "Retry limit reached");
  }
}

export async function processDiscoveryRun(
  supabase: SupabaseClient,
  runId: string,
  leaseToken: string,
  providers: DiscoveryProviders = defaultProviders
): Promise<DiscoveryResult> {
  const { data: run, error } = await supabase.from("discovery_runs").select("*").eq("id", runId).single();
  if (error || !run) throw new Error(error?.message ?? "Discovery run not found");
  const row = run as RunRow;
  const operationKey = row.operation_key ?? runId;
  const discoveryOperationKey = `${operationKey}:discovery`;
  const entitlement = await getUsageEntitlement(supabase, row.profile_id);
  const criteria = parseCriteria(row.criteria);
  const today = new Date().toISOString().slice(0, 10);

  const summaries = Array.isArray(row.stage_summaries) ? [...row.stage_summaries] : [];
  let spentUsd = Number(row.estimated_cost_usd ?? 0);
  let budgetOverrun = false;
  let citations = Array.isArray(row.citations) ? [...row.citations] : [];

  const heartbeat = async () => {
    const { data, error: heartbeatError } = await supabase.rpc("heartbeat_discovery_job", {
      p_run_id: runId,
      p_lease_token: leaseToken,
    });
    if (heartbeatError) throw new Error(heartbeatError.message);
    if (data !== true) throw new DiscoveryLeaseLostError(runId);
  };
  const heartbeatTimer = setInterval(() => {
    void heartbeat().catch((error) => {
      console.error("Discovery lease heartbeat failed", runId, error);
    });
  }, 30_000);

  const setStage = async (stage: StageName) => {
    await heartbeat();
    await supabase.from("discovery_runs").update({ status: "running", current_stage: stage }).eq("id", runId);
  };

  const completeStage = async (stage: StageName, summary: Record<string, unknown>) => {
    await heartbeat();
    summaries.push({ stage, at: new Date().toISOString(), ...summary });
    await supabase
      .from("discovery_runs")
      .update({
        last_completed_stage: stage,
        stage_summaries: summaries,
        estimated_cost_usd: spentUsd,
        budget_overrun: budgetOverrun,
        citations,
      })
      .eq("id", runId);
    await supabase.from("discovery_jobs").update({ last_completed_stage: stage, updated_at: new Date().toISOString() }).eq("run_id", runId);
  };

  const loadArtifact = async (stage: string) => {
    const { data } = await supabase
      .from("discovery_run_artifacts")
      .select("payload")
      .eq("run_id", runId)
      .eq("stage", stage)
      .maybeSingle();
    return data?.payload as Record<string, unknown> | undefined;
  };

  const saveArtifact = async (stage: string, payload: Record<string, unknown>) => {
    await heartbeat();
    const { error: artifactError } = await supabase.from("discovery_run_artifacts").upsert({
      run_id: runId,
      stage,
      payload,
    });
    if (artifactError) throw new Error(artifactError.message);
  };

  const recordStageUsage = async (action: AiAction, usage: AgentUsage) => {
    spentUsd += usage.estimatedCostUsd;
    if (spentUsd > TARGET_DISCOVERY_USD) budgetOverrun = true;
    await recordAiUsage(supabase, {
      action,
      usage,
      creditsCharged: action === "extraction" || action === "research" || action === "fallback_research"
        ? 0
        : entitlement.isOwnerUnlimited
          ? 0
          : CREDIT_COSTS.discovery,
      billingMode: entitlement.billingMode,
      profileId: row.profile_id,
      discoveryRunId: runId,
    });
  };

  try {
    await heartbeat();
    if (["completed", "no_matches", "partial", "failed", "refunded"].includes(row.status)) {
      clearInterval(heartbeatTimer);
      return emptyResult(row);
    }

    let findings = "";
    let researchTruncated = false;
    const researchArtifact = await loadArtifact("research");
    if (researchArtifact?.findings) {
      findings = String(researchArtifact.findings);
      citations = Array.isArray(researchArtifact.citations) ? (researchArtifact.citations as string[]) : citations;
      researchTruncated = Boolean(researchArtifact.truncated);
    } else {
      const researchEstimate = estimateCallUsd({
        inputChars: row.query.length + RESEARCH_PROMPT_OVERHEAD_CHARS,
        maxTokens: RESEARCH_MAX_TOKENS,
        maxSearches: RESEARCH_MAX_SEARCHES,
      });
      if (!canAffordCall(spentUsd, researchEstimate)) {
        await failRun(supabase, runId, operationKey, entitlement.isOwnerUnlimited, "budget_exhausted", "Provider budget remaining could not cover the first research call", leaseToken);
        throw new Error("budget_exhausted");
      }
      await setStage("research");
      const research = await providers.researchCategory({
        sector: row.sector,
        query: buildResearchQuery({ ...criteria, customQuery: criteria.customQuery || row.query }),
        today,
        dateFrom: criteria.dateFrom,
        dateTo: criteria.dateTo,
        types: criteria.types,
        location: criteria.location,
        maxTokens: RESEARCH_MAX_TOKENS,
        maxSearches: RESEARCH_MAX_SEARCHES,
      });
      findings = research.findings;
      citations = research.citations;
      researchTruncated = research.truncated;
      await recordStageUsage("research", research.usage);
      await saveArtifact("research", {
        findings,
        citations,
        truncated: research.truncated,
        stopReason: research.stopReason,
      });
      await completeStage("research", {
        webSearches: research.usage.webSearchRequests,
        estimatedCostUsd: research.usage.estimatedCostUsd,
        truncated: research.truncated,
        remainingBudgetUsd: remainingDiscoveryBudget(spentUsd),
      });
    }

    const runExtraction = async (sourceFindings: string, stage: "extraction" | "fallback_extraction") => {
      const trimmed = trimFindings(sourceFindings);
      const estimate = estimateCallUsd({ inputChars: trimmed.length, maxTokens: EXTRACTION_MAX_TOKENS, maxSearches: 0 });
      if (!canAffordCall(spentUsd, estimate)) {
        return { skipped: true as const, events: [] as EventInput[], truncated: false };
      }
      await setStage("extraction");
      const extracted = await providers.extractEvents({
        findings: trimmed,
        sector: row.sector,
        discoveryQuery: row.query,
        maxTokens: EXTRACTION_MAX_TOKENS,
        retryMaxTokens: EXTRACTION_RETRY_MAX_TOKENS,
        beforeRetry: () =>
          canAffordCall(
            spentUsd,
            estimateCallUsd({
              inputChars: trimmed.length,
              maxTokens: EXTRACTION_RETRY_MAX_TOKENS,
              maxSearches: 0,
            })
          ),
        onUsage: (usage) => recordStageUsage("extraction", usage),
      });
      await saveArtifact(stage, {
        events: extracted.events,
        truncated: extracted.truncated,
        stopReason: extracted.stopReason,
      });
      return { skipped: false as const, ...extracted };
    };

    let extractedEvents: EventInput[] = [];
    let extractionTruncated = false;
    const extractionArtifact = await loadArtifact("extraction");
    if (extractionArtifact?.events) {
      extractedEvents = extractionArtifact.events as EventInput[];
      extractionTruncated = Boolean(extractionArtifact.truncated);
    } else {
      const extracted = await runExtraction(findings, "extraction");
      if (extracted.skipped) {
        await failRun(
          supabase,
          runId,
          operationKey,
          entitlement.isOwnerUnlimited,
          "budget_exhausted",
          "Extraction was skipped because remaining provider budget could not cover a bounded extraction call",
          leaseToken
        );
        throw new Error("budget_exhausted");
      }
      extractedEvents = extracted.events;
      extractionTruncated = extracted.truncated;
      await completeStage("extraction", {
        candidateCount: extractedEvents.length,
        truncated: extractionTruncated,
        estimatedCostUsd: extracted.usage.estimatedCostUsd,
      });
    }

    await setStage("validation");
    let validated = extractedEvents.map((event) => validateOpportunity(event, criteria));
    let classified = classifyValidated(validated);

    // Fallback research is a paid call. Once it has run, an extraction that no
    // longer fits the budget is a technical failure, not an empty result the
    // customer should be charged for — whether this is the first attempt or a
    // resumed one.
    const extractFallback = async (fallbackFindings: string) => {
      const fallbackExtracted = await runExtraction(`${findings}\n\n${fallbackFindings}`, "fallback_extraction");
      if (fallbackExtracted.skipped) {
        await failRun(
          supabase,
          runId,
          operationKey,
          entitlement.isOwnerUnlimited,
          "budget_exhausted",
          "Fallback research completed but the remaining provider budget could not cover its extraction",
          leaseToken
        );
        throw new Error("budget_exhausted");
      }
      extractedEvents = mergeEvents(extractedEvents, fallbackExtracted.events);
      extractionTruncated = extractionTruncated || fallbackExtracted.truncated;
      validated = extractedEvents.map((event) => validateOpportunity(event, criteria));
      classified = classifyValidated(validated);
    };

    const fallbackArtifact = await loadArtifact("fallback_research");
    // A truncated research pass genuinely never finished covering everything
    // the query asked for (e.g. it announced it would research podcasts,
    // then ran out of output tokens before doing so) — that's a real reason
    // to do more research, independent of whether an unrelated part of the
    // request already produced an exact match. Live evaluation (24 Sep 2026)
    // found a broad multi-sector/multi-type search stopping after one exact
    // match even though half the request was never actually researched.
    if ((classified.exact.length === 0 || researchTruncated) && !fallbackArtifact) {
      const fallbackEstimate = estimateCallUsd({
        inputChars: row.query.length + RESEARCH_PROMPT_OVERHEAD_CHARS,
        maxTokens: FALLBACK_MAX_TOKENS,
        maxSearches: FALLBACK_MAX_SEARCHES,
      });
      const extractionReserve = estimateCallUsd({
        inputChars: FINDINGS_PLACEHOLDER,
        maxTokens: EXTRACTION_MAX_TOKENS,
        maxSearches: 0,
      });
      if (canAffordCall(spentUsd, fallbackEstimate + extractionReserve)) {
        await setStage("fallback_research");
        const fallback = await providers.researchCategory({
          sector: row.sector,
          query: buildResearchQuery({ ...criteria, customQuery: criteria.customQuery || row.query }),
          today,
          dateFrom: criteria.dateFrom,
          dateTo: criteria.dateTo,
          types: criteria.types,
          location: criteria.location,
          strategy: "alternate_sources",
          maxTokens: FALLBACK_MAX_TOKENS,
          maxSearches: FALLBACK_MAX_SEARCHES,
        });
        await recordStageUsage("fallback_research", fallback.usage);
        await saveArtifact("fallback_research", { findings: fallback.findings, citations: fallback.citations });
        citations = [...new Set([...citations, ...fallback.citations])];
        await completeStage("fallback_research", {
          webSearches: fallback.usage.webSearchRequests,
          estimatedCostUsd: fallback.usage.estimatedCostUsd,
        });
        await extractFallback(fallback.findings);
      } else {
        await completeStage("fallback_research", { skipped: true, reason: "insufficient_remaining_budget" });
      }
    } else if (fallbackArtifact?.findings) {
      const fallbackExtractedArtifact = await loadArtifact("fallback_extraction");
      if (fallbackExtractedArtifact?.events) {
        extractedEvents = mergeEvents(extractedEvents, fallbackExtractedArtifact.events as EventInput[]);
        validated = extractedEvents.map((event) => validateOpportunity(event, criteria));
        classified = classifyValidated(validated);
      } else if (shouldResumeFallbackExtraction(fallbackArtifact, fallbackExtractedArtifact)) {
        await extractFallback(String(fallbackArtifact.findings));
      }
    }

    await completeStage("validation", {
      candidateCount: extractedEvents.length,
      exact: classified.exact.length,
      related: classified.related.length,
      rejected: classified.rejected.length,
    });

    // Extraction getting cut off mid-response only means the events ARRAY
    // may be incomplete (missing trailing items) — anything that DID parse
    // is a complete, validly-classified object, not corrupt data. Failing
    // (and refunding) the whole search here throws away real "related"
    // suggestions just because none happened to be "exact" yet, the same
    // anti-pattern already fixed for a missing source_url. Only treat this
    // as a real failure when there is truly nothing usable to show at all.
    if (extractionTruncated && classified.exact.length === 0 && classified.related.length === 0) {
      await supabase.from("discovery_runs").update({ extraction_truncated: true }).eq("id", runId);
      await failRun(
        supabase,
        runId,
        operationKey,
        entitlement.isOwnerUnlimited,
        "extraction_truncated",
        "Extraction was truncated before verified opportunities could be saved",
        leaseToken
      );
      throw new ExtractionFailureError("truncated_empty", true);
    }

    await setStage("persist");
    const exactSaved = await persistOpportunities(supabase, runId, classified.exact, "exact");
    const relatedSaved = await persistOpportunities(supabase, runId, classified.related, "related");
    await completeStage("persist", {
      exactSaved: exactSaved.length,
      relatedSaved: relatedSaved.length,
    });

    let contactsFound = 0;
    let contactLookupsAttempted = 0;
    let contactLookupsFailed = 0;
    let enrichmentSkippedForCredits = false;
    let creditsUsedOnEnrichment = 0;

    if (exactSaved.length > 0) {
      await setStage("enrichment");
      const requestedContactLookups = Math.max(0, Math.min(10, row.max_auto_contact_lookups));
      // Automatic paid contact research is only appropriate when direct
      // evidence supports an open submission path. Unknown/watch/closed
      // results remain visible but require an explicit customer action.
      const requestedEvents = exactSaved
        .filter((event) => event.status === "open")
        .slice(0, requestedContactLookups);
      // Contact research an earlier attempt already charged for has to be
      // resolved before any affordability limit is applied. A customer whose
      // balance was spent by those very charges would otherwise have the work
      // they paid for dropped from the results, and an unfinished charge would
      // be left neither delivered nor refunded.
      const priorContactWork = new Map<
        string,
        {
          operationStatus: CreditOperationStatus;
          savedArtifact: Record<string, unknown> | undefined;
          charged: boolean;
          reusable: boolean;
        }
      >();
      await Promise.all(
        requestedEvents.map(async (event) => {
          const [{ data: operation }, savedArtifact] = await Promise.all([
            supabase
              .from("credit_operations")
              .select("status")
              .eq("operation_key", `${operationKey}:enrichment:${event.id}`)
              .maybeSingle(),
            loadArtifact(`enrichment:${event.id}`),
          ]);
          const operationStatus = (operation?.status ?? null) as CreditOperationStatus;
          priorContactWork.set(event.id, {
            operationStatus,
            savedArtifact,
            charged: isContactResearchCharged(operationStatus),
            reusable: shouldReuseContactResearch(operationStatus, savedArtifact),
          });
        })
      );

      const chargedEvents = requestedEvents.filter((event) => priorContactWork.get(event.id)?.charged);
      const unpaidEvents = requestedEvents.filter((event) => !priorContactWork.get(event.id)?.charged);
      let eventsToEnrich = requestedEvents;
      if (!entitlement.isOwnerUnlimited) {
        const remainingBalance = await getCreditBalance(supabase, row.profile_id);
        const affordableCount = Math.max(0, Math.min(unpaidEvents.length, Math.floor(remainingBalance / CREDIT_COSTS.enrichment)));
        const displayedCap = row.displayed_credit_cap ?? CREDIT_COSTS.discovery + requestedContactLookups * CREDIT_COSTS.enrichment;
        const alreadyCharged = chargedEvents.length * CREDIT_COSTS.enrichment;
        const remainingDisplayBudget = Math.max(0, displayedCap - CREDIT_COSTS.discovery - alreadyCharged);
        const displayCount = Math.floor(remainingDisplayBudget / CREDIT_COSTS.enrichment);
        const newLookups = unpaidEvents.slice(0, Math.min(affordableCount, displayCount));
        const selected = new Set([...chargedEvents, ...newLookups].map((event) => event.id));
        eventsToEnrich = requestedEvents.filter((event) => selected.has(event.id));
        enrichmentSkippedForCredits = newLookups.length < unpaidEvents.length;
      }
      contactLookupsAttempted = eventsToEnrich.length;

      const loadPersistedContacts = async (eventId: string): Promise<ContactRecord[]> => {
        const { data: links, error: linksError } = await supabase
          .from("customer_event_contacts")
          .select("contact_id")
          .eq("profile_id", row.profile_id)
          .eq("event_id", eventId)
          .eq("discovery_run_id", runId);
        if (linksError) throw new Error(linksError.message);
        const contactIds = (links ?? []).map((link) => link.contact_id);
        if (contactIds.length === 0) return [];
        const { data: contacts, error: contactsError } = await supabase
          .from("contacts")
          .select("*")
          .in("id", contactIds);
        if (contactsError) throw new Error(contactsError.message);
        return (contacts ?? []) as ContactRecord[];
      };

      /** True only when the charge is confirmed to be no longer owed. */
      const settleFailedCharge = async (key: string): Promise<boolean> => {
        try {
          if (await refundUsageCredits(supabase, { operationKey: key })) return true;
          const { data, error: statusError } = await supabase
            .from("credit_operations")
            .select("status")
            .eq("operation_key", key)
            .maybeSingle();
          if (statusError) return false;
          return data?.status === "refunded";
        } catch (refundError) {
          console.error("Contact credit refund could not be confirmed", key, refundError);
          return false;
        }
      };

      const enrichOne = async (event: EventRecord) => {
        const enrichmentOperationKey = `${operationKey}:enrichment:${event.id}`;
        const artifactStage = `enrichment:${event.id}`;
        const prior = priorContactWork.get(event.id);
        const operationStatus = prior?.operationStatus ?? null;
        const savedArtifact = prior?.savedArtifact;

        const settleCharged = async (contacts: ContactRecord[]) => {
          await saveArtifact(artifactStage, { contacts });
          if (operationStatus === "charged") {
            await completeCreditOperation(supabase, enrichmentOperationKey);
          }
        };

        if (prior?.charged) {
          if (!entitlement.isOwnerUnlimited) creditsUsedOnEnrichment += CREDIT_COSTS.enrichment;
          // Every step here runs against an existing debit: reading saved
          // contacts, rebuilding the artifact and settling the operation.
          // A failure in any of them must end in a confirmed refund or leave
          // the run for another attempt.
          try {
            if (Array.isArray(savedArtifact?.contacts)) {
              const savedContacts = savedArtifact.contacts as ContactRecord[];
              if (operationStatus === "charged") {
                await completeCreditOperation(supabase, enrichmentOperationKey);
              }
              return savedContacts;
            }
            // The charge landed but no artifact did. Anything the interrupted
            // attempt managed to persist is reused; only genuinely unfinished
            // work goes back to the provider, and never at a second debit.
            const persisted = await loadPersistedContacts(event.id);
            if (persisted.length > 0 || shouldReuseContactResearch(operationStatus, savedArtifact)) {
              await settleCharged(persisted);
              return persisted;
            }
            const contacts = await providers.enrichAndSaveContacts(supabase, event, {
              profileId: row.profile_id,
              discoveryRunId: runId,
              billingMode: entitlement.billingMode,
            });
            await settleCharged(contacts);
            return contacts;
          } catch (error) {
            if (!(await settleFailedCharge(enrichmentOperationKey))) {
              throw new UnresolvedChargeError(enrichmentOperationKey, error);
            }
            if (!entitlement.isOwnerUnlimited) creditsUsedOnEnrichment -= CREDIT_COSTS.enrichment;
            throw error;
          }
        }

        const key = await requireAndDebitCredits(supabase, {
          profileId: row.profile_id,
          amount: CREDIT_COSTS.enrichment,
          reason: "enrichment_usage",
          relatedEventId: event.id,
          operationKey: enrichmentOperationKey,
          discoveryRunId: runId,
        });
        if (!entitlement.isOwnerUnlimited) creditsUsedOnEnrichment += CREDIT_COSTS.enrichment;
        try {
          const contacts = await providers.enrichAndSaveContacts(supabase, event, {
            profileId: row.profile_id,
            discoveryRunId: runId,
            billingMode: entitlement.billingMode,
          });
          await saveArtifact(artifactStage, { contacts });
          await completeCreditOperation(supabase, key);
          return contacts;
        } catch (error) {
          if (!(await settleFailedCharge(key))) {
            throw new UnresolvedChargeError(key, error);
          }
          if (!entitlement.isOwnerUnlimited) creditsUsedOnEnrichment -= CREDIT_COSTS.enrichment;
          throw error;
        }
      };

      const contactResults: PromiseSettledResult<Awaited<ReturnType<typeof enrichOne>>>[] = [];
      for (let index = 0; index < eventsToEnrich.length; index += 3) {
        await heartbeat();
        contactResults.push(
          ...(await Promise.allSettled(eventsToEnrich.slice(index, index + 3).map(enrichOne)))
        );
      }
      const unresolved = contactResults.find(
        (result) => result.status === "rejected" && result.reason instanceof UnresolvedChargeError
      );
      if (unresolved?.status === "rejected") throw unresolved.reason;

      contactsFound = contactResults.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value.length : 0), 0);
      contactLookupsFailed = contactResults.filter((result) => result.status === "rejected").length;
      await completeStage("enrichment", {
        attempted: eventsToEnrich.length,
        contactsFound,
        failed: contactLookupsFailed,
        skippedForCredits: enrichmentSkippedForCredits,
      });
    }

    const discoveryCredits = entitlement.isOwnerUnlimited ? 0 : CREDIT_COSTS.discovery;
    const partial = enrichmentSkippedForCredits || contactLookupsFailed > 0;
    const status =
      exactSaved.length === 0 ? "no_matches" : partial ? "partial" : "completed";

    await heartbeat();
    await completeCreditOperation(supabase, discoveryOperationKey);
    await supabase
      .from("discovery_runs")
      .update({
        status,
        current_stage: "done",
        last_completed_stage: exactSaved.length ? "enrichment" : "persist",
        events_found: exactSaved.length,
        candidate_count: extractedEvents.length,
        verified_exact_count: exactSaved.length,
        related_count: relatedSaved.length,
        contact_lookups_attempted: contactLookupsAttempted,
        contacts_found: contactsFound,
        contact_lookups_failed: contactLookupsFailed,
        credits_charged: discoveryCredits + creditsUsedOnEnrichment,
        estimated_cost_usd: spentUsd,
        budget_overrun: budgetOverrun,
        extraction_truncated: extractionTruncated,
        citations,
        error_message:
          status === "no_matches"
            ? "Research finished with no verified opportunities in the selected criteria. Credits were kept for completed research."
            : contactLookupsFailed > 0
              ? `${contactLookupsFailed} contact lookup(s) failed and were not charged`
              : enrichmentSkippedForCredits
                ? "Some contact lookups were skipped because the available credit balance or displayed maximum was reached"
                : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    const { data: completedJob, error: completedJobError } = await supabase
      .from("discovery_jobs")
      .update({ status: "succeeded", updated_at: new Date().toISOString() })
      .eq("run_id", runId)
      .eq("lease_token", leaseToken)
      .select("id")
      .maybeSingle();
    if (completedJobError) throw new Error(completedJobError.message);
    if (!completedJob) throw new DiscoveryLeaseLostError(runId);

    await maybeSendTrialCompleteEmail(supabase, row.profile_id, runId);

    clearInterval(heartbeatTimer);
    return {
      inserted: exactSaved.length,
      contactsFound,
      citations,
      events: exactSaved,
      relatedEvents: relatedSaved,
      runId,
      creditsUsed: discoveryCredits + creditsUsedOnEnrichment,
      billingMode: entitlement.billingMode,
      contactLookupsFailed,
      enrichmentSkippedForCredits: partial,
      status,
      currentStage: "done",
    };
  } catch (error) {
    clearInterval(heartbeatTimer);
    if (error instanceof InsufficientCreditsError) throw error;
    if (error instanceof DiscoveryLeaseLostError) throw error;
    // Leave the lease to expire so the run is claimed again instead of being
    // closed while a contact charge is still outstanding.
    if (error instanceof UnresolvedChargeError) throw error;
    const failureClass =
      error instanceof ExtractionBudgetError
        ? "budget_exhausted"
        : error instanceof ExtractionFailureError
        ? error.truncated
          ? "extraction_truncated"
          : "extraction_failed"
        : error instanceof Error && error.message === "budget_exhausted"
          ? "budget_exhausted"
          : "provider_error";
    const { data: latestRun } = await supabase
      .from("discovery_runs")
      .select("status")
      .eq("id", runId)
      .maybeSingle();
    if (!latestRun || !["failed", "refunded"].includes(latestRun.status)) {
      await failRun(
        supabase,
        runId,
        operationKey,
        entitlement.isOwnerUnlimited,
        failureClass,
        error instanceof Error ? error.message : "Discovery failed",
        leaseToken
      );
    }
    throw error;
  }
}

const FINDINGS_PLACEHOLDER = 20_000;

function mergeEvents(primary: EventInput[], extra: EventInput[]): EventInput[] {
  const seen = new Set(primary.map((event) => `${event.event_name}|${event.event_start}|${event.source_url}`));
  const merged = [...primary];
  for (const event of extra) {
    const key = `${event.event_name}|${event.event_start}|${event.source_url}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(event);
    }
  }
  return merged;
}

async function persistOpportunities(
  supabase: SupabaseClient,
  runId: string,
  items: ValidatedOpportunity[],
  matchKind: "exact" | "related"
): Promise<EventRecord[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase
    .from("events")
    .upsert(
      items.map((item) => ({ ...item.event, discovery_run_id: runId })),
      { onConflict: "event_name,event_start,source_url", ignoreDuplicates: false }
    )
    .select();
  if (error) throw new Error(error.message);
  const saved = (data ?? []) as EventRecord[];
  const { error: linkError } = await supabase.from("discovery_run_events").upsert(
    saved.map((event, index) => ({
      discovery_run_id: runId,
      event_id: event.id,
      result_order: index,
      match_kind: matchKind,
      mismatch_reasons: items[index]?.mismatchReasons ?? [],
    }))
  );
  if (linkError) throw new Error(linkError.message);
  return saved;
}

async function failRun(
  supabase: SupabaseClient,
  runId: string,
  operationKey: string,
  ownerUnbilled: boolean,
  failureClass: string,
  message: string,
  leaseToken?: string
) {
  const discoveryOperationKey = `${operationKey}:discovery`;
  if (leaseToken) {
    const { data: ownsLease, error: leaseError } = await supabase.rpc("heartbeat_discovery_job", {
      p_run_id: runId,
      p_lease_token: leaseToken,
    });
    if (leaseError) throw new Error(leaseError.message);
    if (ownsLease !== true) throw new DiscoveryLeaseLostError(runId);
  }
  let creditsRefunded = 0;
  if (!ownerUnbilled) {
    const refunded = await refundUsageCredits(supabase, { operationKey: discoveryOperationKey });
    if (!refunded) {
      const { data: operation, error: operationError } = await supabase
        .from("credit_operations")
        .select("status")
        .eq("operation_key", discoveryOperationKey)
        .maybeSingle();
      if (operationError) throw new Error(operationError.message);
      if (operation?.status !== "refunded") {
        throw new Error(`Credit refund failed for operation ${discoveryOperationKey}`);
      }
    }
    // A failing run must not keep contact charges its results never delivered.
    const { data: outstanding, error: outstandingError } = await supabase
      .from("credit_operations")
      .select("operation_key")
      .like("operation_key", `${operationKey}:enrichment:%`)
      .eq("status", "charged");
    if (outstandingError) throw new Error(outstandingError.message);
    for (const operation of outstanding ?? []) {
      const key = String(operation.operation_key);
      if (!(await refundUsageCredits(supabase, { operationKey: key }))) {
        throw new Error(`Credit refund failed for operation ${key}`);
      }
    }
    // Count every confirmed refund for this run, including ones completed on
    // an earlier attempt. Counting only this invocation under-reports when
    // refund processing itself has to retry.
    creditsRefunded = await confirmedRefundedCredits(supabase, operationKey);
  }
  await supabase
    .from("discovery_runs")
    .update({
      status: ownerUnbilled ? "failed" : "refunded",
      failure_class: failureClass,
      error_message: message,
      credits_refunded: creditsRefunded,
      completed_at: new Date().toISOString(),
      current_stage: "done",
    })
    .eq("id", runId);
  let jobUpdate = supabase
    .from("discovery_jobs")
    .update({ status: "failed", last_error: failureClass, updated_at: new Date().toISOString() })
    .eq("run_id", runId);
  if (leaseToken) jobUpdate = jobUpdate.eq("lease_token", leaseToken);
  const { data: failedJob, error: failedJobError } = await jobUpdate.select("id").maybeSingle();
  if (failedJobError) throw new Error(failedJobError.message);
  if (leaseToken && !failedJob) throw new DiscoveryLeaseLostError(runId);
}

async function confirmedRefundedCredits(supabase: SupabaseClient, operationKey: string): Promise<number> {
  const [{ data: discoveryOp, error: discoveryError }, { data: enrichmentOps, error: enrichmentError }] =
    await Promise.all([
      supabase
        .from("credit_operations")
        .select("amount, status")
        .eq("operation_key", `${operationKey}:discovery`)
        .maybeSingle(),
      supabase
        .from("credit_operations")
        .select("amount, status")
        .like("operation_key", `${operationKey}:enrichment:%`),
    ]);
  if (discoveryError) throw new Error(discoveryError.message);
  if (enrichmentError) throw new Error(enrichmentError.message);
  const refundedAmount = (operation: { amount?: unknown; status?: unknown } | null | undefined) =>
    operation?.status === "refunded"
      ? Number(operation.amount ?? CREDIT_COSTS.discovery)
      : 0;
  return (
    refundedAmount(discoveryOp) +
    (enrichmentOps ?? []).reduce((sum, operation) => sum + refundedAmount(operation), 0)
  );
}

function emptyResult(row: RunRow): DiscoveryResult {
  return {
    inserted: 0,
    contactsFound: 0,
    citations: row.citations ?? [],
    events: [],
    runId: row.id,
    creditsUsed: 0,
    billingMode: row.billing_mode,
    contactLookupsFailed: 0,
    enrichmentSkippedForCredits: false,
    status: row.status,
    currentStage: row.current_stage,
  };
}

/** Backward-compatible helper used by the daily schedule cron. */
export async function runDiscovery(
  supabase: SupabaseClient,
  params: {
    sector: string;
    query: string;
    profileId: string;
    maxAutoContactLookups?: number;
    operationKey?: string;
  }
): Promise<DiscoveryResult> {
  const queued = await enqueueDiscovery(supabase, params);
  try {
    const result = await claimAndProcessDiscoveryRun(supabase, queued.runId);
    if (result) return result;
    throw new Error("Discovery job is already claimed");
  } catch {
    const { data } = await supabase
      .from("discovery_runs")
      .select("id, status, events_found, contacts_found, contact_lookups_failed, credits_charged, billing_mode")
      .eq("id", queued.runId)
      .single();
    return {
      inserted: data?.events_found ?? 0,
      contactsFound: data?.contacts_found ?? 0,
      citations: [],
      events: [],
      runId: queued.runId,
      creditsUsed: data?.credits_charged ?? 0,
      billingMode: data?.billing_mode ?? "customer_credits",
      contactLookupsFailed: data?.contact_lookups_failed ?? 0,
      enrichmentSkippedForCredits: data?.status === "partial",
      status: data?.status,
    };
  }
}
