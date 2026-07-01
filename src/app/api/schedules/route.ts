import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { assertCronAuthorized, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("discovery_schedules")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedules: data ?? [] });
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

  let body: { sector?: string; query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sector || !body.query) {
    return NextResponse.json({ error: "sector and query are required" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("discovery_schedules")
    .insert({ sector: body.sector, query: body.query })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ schedule: data });
}
