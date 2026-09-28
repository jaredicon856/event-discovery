import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentUsage } from "@/lib/agent";

export type AiAction = "discovery" | "enrichment" | "research" | "fallback_research" | "extraction";

export async function recordAiUsage(
  supabase: SupabaseClient,
  params: {
    action: AiAction;
    usage: AgentUsage;
    creditsCharged: number;
    billingMode?: "customer_credits" | "owner_unbilled";
    profileId?: string;
    relatedEventId?: string;
    discoveryRunId?: string;
  }
): Promise<void> {
  const { error } = await supabase.from("ai_usage").insert({
    profile_id: params.profileId ?? null,
    action: params.action,
    related_event_id: params.relatedEventId ?? null,
    discovery_run_id: params.discoveryRunId ?? null,
    input_tokens: params.usage.inputTokens,
    output_tokens: params.usage.outputTokens,
    cache_creation_input_tokens: params.usage.cacheCreationInputTokens,
    cache_read_input_tokens: params.usage.cacheReadInputTokens,
    web_search_requests: params.usage.webSearchRequests,
    estimated_cost_usd: params.usage.estimatedCostUsd,
    credits_charged: params.creditsCharged,
    billing_mode: params.billingMode ?? "customer_credits",
  });

  if (error) throw new Error(`Failed to record AI usage: ${error.message}`);
}
