import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { runDiscovery } from "@/lib/discovery";
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

  try {
    const supabase = getSupabaseServiceClient();
    const result = await runDiscovery(supabase, { sector: body.sector, query: body.query });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
