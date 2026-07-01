/**
 * Seed the events table from the example CSV.
 * Usage: npx tsx scripts/seed-events.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { EventInput } from "../src/types/event";

config({ path: join(__dirname, "..", ".env.local") });

function toIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /tbd/i.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  // Use local date parts, not toISOString(), which would shift the date
  // across a UTC day boundary depending on the machine's timezone.
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toStatus(value: string | undefined): EventInput["status"] {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "open" || v === "closed" || v === "watch") return v;
  return "unknown";
}

function toTier(value: string | undefined): EventInput["visibility_tier"] {
  const v = (value ?? "").trim().toUpperCase();
  if (v === "A" || v === "B" || v === "C") return v;
  return null;
}

async function main() {
  const csvPath = join(__dirname, "seed-events.csv");
  const raw = readFileSync(csvPath, "utf-8");

  // Row 1 is a free-text title line, row 2 is the real header.
  const lines = raw.split(/\r?\n/);
  const csvBody = lines.slice(1).join("\n");

  const rows: Record<string, string>[] = parse(csvBody, {
    columns: true,
    skip_empty_lines: true,
  });

  const events: EventInput[] = rows
    .filter((r) => r["Event / Series"])
    .map((r) => ({
      sector: r["Sector"] || "Uncategorized",
      event_name: r["Event / Series"],
      opportunity_type: r["Opportunity Type"] || null,
      event_start: toIsoDate(r["Event Start"]),
      event_end: toIsoDate(r["Event End"]),
      date_notes: r["Date Notes"] || null,
      city: r["City"] || null,
      state_country: r["State/Country"] || null,
      venue_format: r["Venue / Format"] || null,
      status: toStatus(r["Status"]),
      cfp_deadline: toIsoDate(r["CFP / Speaker Deadline"]),
      audience_reach: r["Audience / Reach"] || null,
      potential_cost: r["Potential Cost to Speak"] || null,
      why_it_matters: r["Why It Matters"] || null,
      best_client_fit: r["Best Client Fit"] || null,
      booking_path: r["Booking Path"] || null,
      source_url: r["Source URL"] || null,
      visibility_tier: toTier(r["Visibility Tier"]),
      discovered_via: "seed_csv",
      discovery_query: null,
    }));

  console.log(`Parsed ${events.length} events from CSV.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before seeding.");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("events")
    .upsert(events, { onConflict: "event_name,event_start,source_url" })
    .select();

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log(`Seeded/updated ${data?.length ?? 0} events.`);
}

main();
