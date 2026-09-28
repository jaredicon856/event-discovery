import Anthropic from "@anthropic-ai/sdk";
import type { EventInput } from "@/types/event";

const MODEL = "claude-sonnet-5";

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  webSearchRequests: number;
  estimatedCostUsd: number;
}

type RawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
};

function parseUsage(usage: RawUsage): AgentUsage {
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreationInputTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadInputTokens = usage.cache_read_input_tokens ?? 0;
  const webSearchRequests = usage.server_tool_use?.web_search_requests ?? 0;
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    webSearchRequests,
    // Sonnet 5 standard pricing as of 2026-09-22:
    // $2 input, $10 output, $2.50 cache write, $0.20 cache read / MTok;
    // web search is $10 / 1,000 requests.
    estimatedCostUsd:
      inputTokens * 0.000002 +
      outputTokens * 0.00001 +
      cacheCreationInputTokens * 0.0000025 +
      cacheReadInputTokens * 0.0000002 +
      webSearchRequests * 0.01,
  };
}

export function combineAgentUsage(...items: AgentUsage[]): AgentUsage {
  return {
    inputTokens: items.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: items.reduce((sum, item) => sum + item.outputTokens, 0),
    cacheCreationInputTokens: items.reduce((sum, item) => sum + item.cacheCreationInputTokens, 0),
    cacheReadInputTokens: items.reduce((sum, item) => sum + item.cacheReadInputTokens, 0),
    webSearchRequests: items.reduce((sum, item) => sum + item.webSearchRequests, 0),
    estimatedCostUsd: items.reduce((sum, item) => sum + item.estimatedCostUsd, 0),
  };
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey });
}

/**
 * Step 1 — research. Claude drives its own web_search tool calls (server-side,
 * handled by Anthropic) and returns a findings brief with URLs and specifics
 * for every candidate event/opportunity it found.
 */
export interface ResearchParams {
  sector: string;
  query: string;
  today?: string;
  dateFrom?: string;
  dateTo?: string;
  types?: string[];
  location?: string;
  strategy?: "primary" | "alternate_sources";
  maxTokens?: number;
  maxSearches?: number;
}

export async function researchCategory(
  params: ResearchParams
): Promise<{ findings: string; citations: string[]; usage: AgentUsage; stopReason: string | null; truncated: boolean }> {
  const client = getClient();
  const { sector, query } = params;
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  const maxTokens = params.maxTokens ?? 2500;
  const maxSearches = params.maxSearches ?? 4;
  const strategyNote =
    params.strategy === "alternate_sources"
      ? `Use a different source pattern than a generic web sweep: association calendars, society CFP pages, university executive programs, podcast networks, and standing speaker-bureau calls. Do not relax sector, location, date, or type.`
      : `Prefer official event, association, and CFP pages.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: maxSearches,
      } as Anthropic.Messages.WebSearchTool20250305,
    ],
    messages: [
      {
        role: "user",
        content: `You are a research agent finding speaking/networking opportunities for a speaker-placement business.

Today's date: ${today}
Selected date window: ${params.dateFrom ?? today} to ${params.dateTo ?? "18 months from today"}
Sector/category: ${sector}
Location preference: ${params.location || "any"}
Opportunity types requested: ${(params.types ?? []).join(", ") || "conferences, panels, workshops, podcasts, standing programs"}
Search focus: ${query}
Strategy: ${strategyNote}

Treat the selected sector, location, date window, and opportunity types as hard relevance criteria.
Use the available searches deliberately: first look for official CFP/application pages, then official
event calendars and sector-association programs, then current podcast/standing-program pitch pages
when those types were requested. Search using useful synonyms, but do not substitute a conference
for a podcast request or a generic directory listing for a direct application path.

Search the web for real opportunities where a business owner, coach, consultant, founder, or executive could speak,
present, be a podcast guest, or apply to a standing speaker program. Include:
- Named conferences/summits/expos with dates inside the selected window
- Recurring multi-city circuits (list each city instance you find, not just the brand)
- Podcasts and standing speaker programs that currently accept pitches even if they have no single event date
- Association/membership bodies with a standing call-for-speakers program

For each one you find, report:
- Event/organization name
- Opportunity type (conference/panel/workshop/podcast/standing program/etc)
- Start and end dates when published; for ongoing podcasts or standing programs say they are ongoing and do not invent a date
- City, state/country, or "remote/online"
- Venue or format
- CFP/speaker/pitch deadline if stated
- Audience size/description
- Any stated cost to speak or speaker compensation
- Why this venue matters
- Best-fit client profile
- The booking/submission path
- Direct evidence that submissions are currently open, if any
- The most specific official source URL supporting that exact event, date, and submission path

Only report distinct opportunities you found evidence for. Never invent dates, deadlines, openness, or event names.
Do not turn a save-the-date listing into an open CFP. Mark closed calls as closed, and describe a
recurrence only as a future watch item. Third-party directories may help discovery but are not proof
that a pitch path is currently open. If a detail is unpublished, say so.`,
      },
    ],
  });

  const textBlocks = res.content.filter((b) => b.type === "text");
  const findings = textBlocks.map((b) => ("text" in b ? b.text : "")).join("\n\n");

  const citations: string[] = [];
  for (const block of textBlocks) {
    if ("citations" in block && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c && typeof c === "object" && "url" in c && typeof c.url === "string") {
          citations.push(c.url);
        }
      }
    }
  }

  const stopReason = res.stop_reason ?? null;
  return {
    findings,
    citations: Array.from(new Set(citations)),
    usage: parseUsage(res.usage as RawUsage),
    stopReason,
    truncated: stopReason === "max_tokens",
  };
}

const EVENT_SCHEMA = {
  type: "object" as const,
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sector: { type: "string" },
          event_name: { type: "string" },
          opportunity_type: { type: ["string", "null"] },
          event_start: { type: ["string", "null"], description: "ISO date YYYY-MM-DD, or null if unknown" },
          event_end: { type: ["string", "null"], description: "ISO date YYYY-MM-DD, or null if unknown" },
          date_notes: { type: ["string", "null"] },
          city: { type: ["string", "null"] },
          state_country: { type: ["string", "null"] },
          venue_format: { type: ["string", "null"] },
          status: { type: "string", enum: ["open", "closed", "unknown", "watch"] },
          cfp_deadline: { type: ["string", "null"], description: "ISO date YYYY-MM-DD, or null" },
          audience_reach: { type: ["string", "null"] },
          potential_cost: { type: ["string", "null"] },
          why_it_matters: { type: ["string", "null"] },
          best_client_fit: { type: ["string", "null"] },
          booking_path: { type: ["string", "null"] },
          source_url: { type: ["string", "null"] },
          visibility_tier: { type: ["string", "null"], enum: ["A", "B", "C", null] },
        },
        required: ["sector", "event_name", "status"],
      },
    },
  },
  required: ["events"],
};

/**
 * Step 2 — normalize the free-text findings into rows matching the events table
 * schema by forcing a tool call with a strict JSON schema.
 */
export class ExtractionFailureError extends Error {
  constructor(
    message: string,
    public truncated: boolean
  ) {
    super(message);
    this.name = "ExtractionFailureError";
  }
}

export class ExtractionBudgetError extends Error {
  constructor() {
    super("Extraction retry skipped because the remaining provider budget was insufficient");
    this.name = "ExtractionBudgetError";
  }
}

interface ExtractionResponse {
  content: ReadonlyArray<{ type: string; input?: unknown }>;
  stop_reason: string | null;
  usage: RawUsage;
}

function mapExtractedEvents(
  events: unknown,
  sector: string,
  discoveryQuery: string
): EventInput[] {
  if (!Array.isArray(events)) {
    throw new ExtractionFailureError("Event extraction returned a malformed events collection", false);
  }
  return events.map((e) => ({
    sector: (e.sector as string) || sector,
    event_name: e.event_name as string,
    opportunity_type: (e.opportunity_type as string) ?? null,
    event_start: (e.event_start as string) ?? null,
    event_end: (e.event_end as string) ?? null,
    date_notes: (e.date_notes as string) ?? null,
    city: (e.city as string) ?? null,
    state_country: (e.state_country as string) ?? null,
    venue_format: (e.venue_format as string) ?? null,
    status: (e.status as EventInput["status"]) ?? "unknown",
    cfp_deadline: (e.cfp_deadline as string) ?? null,
    audience_reach: (e.audience_reach as string) ?? null,
    potential_cost: (e.potential_cost as string) ?? null,
    why_it_matters: (e.why_it_matters as string) ?? null,
    best_client_fit: (e.best_client_fit as string) ?? null,
    booking_path: (e.booking_path as string) ?? null,
    source_url: (e.source_url as string) ?? null,
    visibility_tier: (e.visibility_tier as EventInput["visibility_tier"]) ?? null,
    discovered_via: "agent_search",
    discovery_query: discoveryQuery,
    raw_extract: e,
  }));
}

export async function extractEvents(params: {
  findings: string;
  sector: string;
  discoveryQuery: string;
  maxTokens?: number;
  retryMaxTokens?: number;
  beforeRetry?: () => boolean | Promise<boolean>;
  onUsage?: (usage: AgentUsage) => void | Promise<void>;
  request?: (tokenBudget: number, extraInstruction: string) => Promise<ExtractionResponse>;
}): Promise<{ events: EventInput[]; usage: AgentUsage; truncated: boolean; stopReason: string | null }> {
  const { findings, sector, discoveryQuery } = params;
  const maxTokens = params.maxTokens ?? 4000;
  const retryMaxTokens = params.retryMaxTokens ?? 2500;

  async function runExtract(tokenBudget: number, extraInstruction = "") {
    if (params.request) return params.request(tokenBudget, extraInstruction);
    return getClient().messages.create({
      model: MODEL,
      max_tokens: tokenBudget,
      tool_choice: { type: "tool", name: "submit_events" },
      tools: [
        {
          name: "submit_events",
          description: "Submit the structured list of events extracted from the research findings.",
          input_schema: EVENT_SCHEMA,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Convert the following research findings into structured event rows.
Only include real, distinct opportunities mentioned in the findings — one row per event/instance
(e.g. each city of a multi-city expo is its own row). Leave fields null if not stated; do not
fabricate dates, deadlines, costs, or openness.
Set status to "open" ONLY when the findings quote a currently open CFP, pitch form, or stated open call.
If a path is mentioned without evidence it is currently open, use "unknown".
Podcasts and standing speaker programs may have null event_start; put "standing/ongoing" in date_notes instead of inventing a date.
${extraInstruction}

Findings:
${findings}`,
        },
      ],
    });
  }

  const res = await runExtract(maxTokens);
  let usage = parseUsage(res.usage as RawUsage);
  await params.onUsage?.(usage);
  const truncated = res.stop_reason === "max_tokens";
  const toolUse = res.content.find((b) => b.type === "tool_use");

  // One corrective retry, shared by both known bad-response shapes: the
  // response got cut off mid-tool-call (truncated), or the model returned a
  // complete tool call whose "events" field wasn't a valid array despite the
  // forced schema (rare, but seen live — see mapExtractedEvents below).
  // Retrying beats failing (and refunding) the whole paid search outright.
  const retryOnce = async (extraInstruction: string) => {
    if (params.beforeRetry && !(await params.beforeRetry())) {
      throw new ExtractionBudgetError();
    }
    const retry = await runExtract(retryMaxTokens, extraInstruction);
    const retryUsage = parseUsage(retry.usage as RawUsage);
    await params.onUsage?.(retryUsage);
    usage = combineAgentUsage(usage, retryUsage);
    const retryTool = retry.content.find((b) => b.type === "tool_use");
    return { retry, retryTool };
  };

  if (truncated && (!toolUse || toolUse.type !== "tool_use")) {
    const { retry, retryTool } = await retryOnce(
      "The previous extraction response was truncated. Submit as many complete event objects as you can, omitting incomplete trailing items."
    );
    if (!retryTool || retryTool.type !== "tool_use") {
      throw new ExtractionFailureError("Event extraction was truncated and produced no structured results", true);
    }
    const retryInput = retryTool.input as { events?: unknown };
    return {
      events: mapExtractedEvents(retryInput.events ?? [], sector, discoveryQuery),
      usage,
      truncated: true,
      stopReason: retry.stop_reason ?? "max_tokens",
    };
  }

  if (!toolUse || toolUse.type !== "tool_use") {
    throw new ExtractionFailureError("Event extraction did not return structured results", truncated);
  }

  const input = toolUse.input as { events?: unknown };
  if (!Array.isArray(input.events)) {
    const { retry, retryTool } = await retryOnce(
      `Your previous response's "events" field was not a valid JSON array. Resubmit the tool call with events as a JSON array — use an empty array if there are truly no events.`
    );
    if (!retryTool || retryTool.type !== "tool_use") {
      throw new ExtractionFailureError("Event extraction did not return structured results", truncated);
    }
    const retryInput = retryTool.input as { events?: unknown };
    return {
      events: mapExtractedEvents(retryInput.events ?? [], sector, discoveryQuery),
      usage,
      truncated: retry.stop_reason === "max_tokens",
      stopReason: retry.stop_reason ?? null,
    };
  }

  return {
    events: mapExtractedEvents(input.events, sector, discoveryQuery),
    usage,
    truncated,
    stopReason: res.stop_reason ?? null,
  };
}

const CONTACT_SCHEMA = {
  type: "object" as const,
  properties: {
    contacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          email: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
          linkedin_url: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          source_url: { type: ["string", "null"] },
        },
        required: ["confidence"],
      },
    },
  },
  required: ["contacts"],
};

/**
 * Contact enrichment: given an event and its source URL, research who organizes
 * the CFP/speaker submission process and how to reach them.
 */
export async function findEventContacts(params: {
  eventName: string;
  sourceUrl: string | null;
  bookingPath: string | null;
}): Promise<{
  contacts: Array<{
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    confidence: "high" | "medium" | "low";
    source_url: string | null;
  }>;
  usage: AgentUsage;
}> {
  const client = getClient();
  const { eventName, sourceUrl, bookingPath } = params;

  const research = await client.messages.create({
    model: MODEL,
    max_tokens: 3072,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 10,
      } as Anthropic.Messages.WebSearchTool20250305,
    ],
    messages: [
      {
        role: "user",
        content: `Find the best contact for pitching a speaker to this event/opportunity: "${eventName}".
${sourceUrl ? `Source URL: ${sourceUrl}` : ""}
${bookingPath ? `Known booking path: ${bookingPath}` : ""}

Goal, in priority order:
1. A DIRECT EMAIL ADDRESS for a named individual (organizer, founder/CEO, program/content director,
   speaker relations contact, or CFP coordinator).
2. A DIRECT PHONE NUMBER for that same named individual.
3. If no direct email/phone for a named person exists, a named individual's LinkedIn profile.
4. Only as a last resort — no named individual found at all — a generic org contact (main phone
   line, info@ email, a speaker-application portal with no person attached).

Do not stop after one search. Actively check multiple places before giving up on finding an email
or phone for a named person:
- The event/organization's "About," "Team," "Staff," or "Contact" page
- Press releases or media kits (often list a named PR/media contact with direct email)
- The named organizer's personal website, bio page, or speaker page (often lists email)
- If you find a name and a company domain but no published email, note the likely email pattern
  (e.g. firstname@company.com) ONLY if that pattern is confirmed elsewhere on the same domain for
  other staff — mark this as "low" confidence and say in the notes that it's an inferred pattern,
  never fabricate without at least one confirmed example.

Only fall back to a generic org contact if you truly cannot find any named individual — and even
then, only include it if it's the only lead available, not alongside a named contact.

Report every name, title, email address, phone number, and LinkedIn URL you find, and rate your
confidence in each (high = directly published contact info for a named person, medium = named
person but contact info inferred/pattern-matched, low = generic org contact only). Only report
information you actually found or reasonably inferred as described above — never invent an email
or phone number.`,
      },
    ],
  });

  const findings = research.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n\n");

  const extraction = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tool_choice: { type: "tool", name: "submit_contacts" },
    tools: [
      {
        name: "submit_contacts",
        description: "Submit structured contact records extracted from the research findings.",
        input_schema: CONTACT_SCHEMA,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Extract structured contact records from these findings. If nothing concrete was found,
submit an empty contacts array rather than guessing.

If the findings include at least one NAMED individual, only submit named contacts — drop any
generic/unnamed entries (bare phone numbers, info@ addresses, application portals with no person
attached), since a named contact makes those redundant. Only submit a generic/unnamed contact when
it's the sole lead found.\n\n${findings}`,
      },
    ],
  });

  const toolUse = extraction.content.find((b) => b.type === "tool_use");
  const usage = combineAgentUsage(
    parseUsage(research.usage as RawUsage),
    parseUsage(extraction.usage as RawUsage)
  );
  if (!toolUse || toolUse.type !== "tool_use") return { contacts: [], usage };
  const input = toolUse.input as { contacts?: Array<Record<string, unknown>> };
  return {
    contacts: (input.contacts ?? []).map((c) => ({
      name: (c.name as string) ?? null,
      title: (c.title as string) ?? null,
      email: (c.email as string) ?? null,
      phone: (c.phone as string) ?? null,
      linkedin_url: (c.linkedin_url as string) ?? null,
      confidence: (c.confidence as "high" | "medium" | "low") ?? "low",
      source_url: (c.source_url as string) ?? sourceUrl,
    })),
    usage,
  };
}
