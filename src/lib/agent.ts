import Anthropic from "@anthropic-ai/sdk";
import type { EventInput } from "@/types/event";

const MODEL = "claude-sonnet-5";

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
export async function researchCategory(params: {
  sector: string;
  query: string;
}): Promise<{ findings: string; citations: string[] }> {
  const client = getClient();
  const { sector, query } = params;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 8,
      } as Anthropic.Messages.WebSearchTool20250305,
    ],
    messages: [
      {
        role: "user",
        content: `You are a research agent finding speaking/networking opportunities for a speaker-placement business.

Sector/category: ${sector}
Search focus: ${query}

Search the web for real, currently-scheduled (2026 or later) events, conferences, expos, or organizations
matching this category where a business owner, coach, consultant, founder, or executive could speak,
present, or be on a panel. Include:
- Named conferences/summits/expos with open or upcoming calls-for-speakers
- Recurring multi-city circuits (list each city instance you find, not just the brand)
- Companies/organizations whose business model is running curated speaking events (e.g. speaker bureaus)
- Association/membership bodies with a standing "call for speakers" program

For each one you find, report in your findings text:
- Event/organization name
- Opportunity type (keynote/panel/workshop/breakout/etc)
- Start and end dates (or date notes if exact dates aren't published)
- City, state/country
- Venue or format
- CFP/speaker submission deadline if stated
- Audience size/description
- Any stated cost to speak or speaker compensation
- Why this venue matters for visibility
- Best-fit client profile (what kind of expert/speaker fits this stage)
- The booking/submission path (e.g. "submit via CFP page", "contact organizer")
- The source URL you found this on

Be concrete and only report opportunities you actually found evidence for via search — do not invent events.
If you're not fully sure of a detail (e.g. exact date), say so rather than guessing.`,
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

  return { findings, citations: Array.from(new Set(citations)) };
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
export async function extractEvents(params: {
  findings: string;
  sector: string;
  discoveryQuery: string;
}): Promise<EventInput[]> {
  const client = getClient();
  const { findings, sector, discoveryQuery } = params;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
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
fabricate dates, deadlines, or costs. Default "status" to "open" if a CFP/submission path is
mentioned and nothing says it's closed, otherwise "unknown".

Findings:
${findings}`,
      },
    ],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input = toolUse.input as { events?: Array<Record<string, unknown>> };
  const events = input.events ?? [];

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
}): Promise<
  Array<{
    name: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    confidence: "high" | "medium" | "low";
    source_url: string | null;
  }>
> {
  const client = getClient();
  const { eventName, sourceUrl, bookingPath } = params;

  const research = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      } as Anthropic.Messages.WebSearchTool20250305,
    ],
    messages: [
      {
        role: "user",
        content: `Find the best contact for pitching a speaker to this event/opportunity: "${eventName}".
${sourceUrl ? `Source URL: ${sourceUrl}` : ""}
${bookingPath ? `Known booking path: ${bookingPath}` : ""}

Look for: the event organizer, program/content director, speaker relations contact, or CFP coordinator.
Report any name, title, email address, phone number, or LinkedIn URL you find, and note how confident
you are in each (high = directly published contact info, medium = inferred from role/org, low = generic
org contact only). Only report information you actually found.`,
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
submit an empty contacts array rather than guessing.\n\n${findings}`,
      },
    ],
  });

  const toolUse = extraction.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];
  const input = toolUse.input as { contacts?: Array<Record<string, unknown>> };
  return (input.contacts ?? []).map((c) => ({
    name: (c.name as string) ?? null,
    title: (c.title as string) ?? null,
    email: (c.email as string) ?? null,
    phone: (c.phone as string) ?? null,
    linkedin_url: (c.linkedin_url as string) ?? null,
    confidence: (c.confidence as "high" | "medium" | "low") ?? "low",
    source_url: (c.source_url as string) ?? sourceUrl,
  }));
}
