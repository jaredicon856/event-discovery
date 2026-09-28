/**
 * Repeatable live-provider evaluation. Does not reconstruct historical
 * uninstrumented runs. Set EVAL_LIVE_SEARCH=1 to spend Anthropic budget.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const CASES = [
  { name: "healthcare_leadership", sector: "healthcare", query: "call for speakers hospital executive conference", types: ["conference", "panel"] },
  { name: "financial_services", sector: "financial_services", query: "wealth management advisor conference speakers", types: ["conference", "panel"] },
  { name: "technology_saas", sector: "technology", query: "SaaS founder conference panels", types: ["conference", "panel"] },
  { name: "professional_services", sector: "professional_services", query: "consulting partner leadership summit CFP", types: ["conference", "workshop"] },
  { name: "podcasts_standing", sector: "healthcare", query: "executive leadership podcast guest pitch", types: ["podcast", "standing_program"] },
  { name: "narrow_no_match", sector: "healthcare", query: "underwater basket weaving hospital CFO keynote Antarctica 2099", types: ["conference"] },
  { name: "education_workshop", sector: "education", query: "higher education administrator workshop call for speakers", types: ["workshop"] },
  { name: "nonprofit_expo", sector: "nonprofit", query: "nonprofit association annual expo speaker submissions", types: ["expo"] },
  { name: "real_estate_standing", sector: "real_estate", query: "commercial real estate industry standing speaker roster", types: ["standing_program"] },
  { name: "energy_panel", sector: "energy", query: "energy industrials sustainability panel call for speakers", types: ["panel"] },
];

async function main() {
  const { getSupabaseServiceClient } = await import("../src/lib/supabase");
  const supabase = getSupabaseServiceClient();
  const { data: historical } = await supabase
    .from("discovery_runs")
    .select("id, query, status, events_found, estimated_cost_usd, created_at, current_stage, failure_class")
    .ilike("query", "%call for speakers%")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("Recent speaker-search runs (current columns only; old artifacts were not retained):", historical);
  console.log("Confirmed earlier: healthcare runs executed, persisted 0 events, research artifacts were not retained.");
  console.log("This script cannot reconstruct those 2026-09-22 stage internals.");

  if (process.env.EVAL_LIVE_SEARCH !== "1") {
    console.log("Skipping live provider evaluation (set EVAL_LIVE_SEARCH=1).");
    console.log("Cases:", CASES.map((item) => item.name).join(", "));
    return;
  }

  const { claimAndProcessDiscoveryRun, enqueueDiscovery } = await import("../src/lib/discovery");
  const profileId = process.env.EVAL_PROFILE_ID;
  if (!profileId) throw new Error("EVAL_PROFILE_ID required for live evaluation");
  const spendingCeiling = Number(process.env.EVAL_SPENDING_CEILING_USD ?? 3);
  const minimumReservePerCase = 0.5;
  let measuredTotal = 0;
  const batchId = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const selectedCase = process.env.EVAL_CASE;

  for (const testCase of CASES) {
    if (selectedCase && testCase.name !== selectedCase) continue;
    const remaining = spendingCeiling - measuredTotal;
    if (remaining < minimumReservePerCase) {
      console.log(
        `STOPPED before ${testCase.name}: $${remaining.toFixed(4)} remaining is below the $${minimumReservePerCase.toFixed(2)} call reserve.`
      );
      break;
    }
    const queued = await enqueueDiscovery(supabase, {
      sector: testCase.sector,
      query: testCase.query,
      profileId,
      maxAutoContactLookups: 0,
      operationKey: `eval:${batchId}:${testCase.name}`,
      criteria: {
        sectors: [testCase.sector],
        location: "",
        dateFrom: new Date().toISOString().slice(0, 10),
        dateTo: new Date(new Date().setUTCMonth(new Date().getUTCMonth() + 18)).toISOString().slice(0, 10),
        types: testCase.types as import("../src/lib/searchCriteria").OpportunityTypeId[],
        expertise: "",
        audience: "",
        customQuery: testCase.query,
      },
    });
    let processingError: string | null = null;
    try {
      await claimAndProcessDiscoveryRun(supabase, queued.runId);
    } catch (error) {
      processingError = error instanceof Error ? error.message : "Unknown processing error";
    }
    const { data: run } = await supabase
      .from("discovery_runs")
      .select("status, estimated_cost_usd, budget_overrun, extraction_truncated, verified_exact_count, related_count, failure_class, stage_summaries")
      .eq("id", queued.runId)
      .single();
    const { data: usageRows } = await supabase
      .from("ai_usage")
      .select("action, input_tokens, output_tokens, web_search_requests, estimated_cost_usd")
      .eq("discovery_run_id", queued.runId);
    const runCost = (usageRows ?? []).reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd),
      0
    );
    measuredTotal += runCost;
    console.log(
      JSON.stringify({
        case: testCase.name,
        runId: queued.runId,
        run,
        usageRows,
        runCostUsd: Number(runCost.toFixed(6)),
        cumulativeCostUsd: Number(measuredTotal.toFixed(6)),
        processingError,
      })
    );
    if (measuredTotal >= spendingCeiling) {
      console.log(`STOPPED: measured spend reached $${measuredTotal.toFixed(4)}.`);
      break;
    }
  }
  console.log(`Measured evaluation spend: $${measuredTotal.toFixed(6)} / $${spendingCeiling.toFixed(2)} ceiling.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
