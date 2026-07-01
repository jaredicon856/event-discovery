import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { researchCategory, extractEvents } from "@/lib/agent";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";

export const maxDuration = 300;

interface DiscoverBody {
  sector: string;
  query: string;
}

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }

  let body: DiscoverBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sector || !body.query) {
    return NextResponse.json({ error: "sector and query are required" }, { status: 400 });
  }

  const { findings, citations } = await researchCategory({ sector: body.sector, query: body.query });
  const events = await extractEvents({ findings, sector: body.sector, discoveryQuery: body.query });

  if (events.length === 0) {
    return NextResponse.json({ inserted: 0, updated: 0, citations, events: [] });
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("events")
    .upsert(events, { onConflict: "event_name,event_start,source_url", ignoreDuplicates: false })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message, events }, { status: 500 });
  }

  return NextResponse.json({ inserted: data?.length ?? 0, citations, events: data });
}
