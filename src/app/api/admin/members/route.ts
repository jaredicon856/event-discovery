import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireSuperAdmin } from "@/lib/access";
import { loadMemberSpendSummaries } from "@/lib/adminSpend";
import { getCreditBalance } from "@/lib/credits";

export async function GET(request: NextRequest) {
  try {
    const { service } = await requireSuperAdmin();
    const { searchParams } = new URL(request.url);
    const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const requestedPageSize = Number.parseInt(searchParams.get("pageSize") ?? "25", 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isFinite(requestedPageSize)
      ? Math.min(100, Math.max(1, requestedPageSize))
      : 25;
    const query = (searchParams.get("q") ?? "").trim().slice(0, 100);
    const status = searchParams.get("status");
    const from = (page - 1) * pageSize;

    let membersQuery = service
      .from("profiles")
      .select("id, email, role, access_status, invited_at, activated_at, created_at", { count: "exact" })
      .eq("is_test_account", false)
      .neq("role", "super_admin")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (query) membersQuery = membersQuery.ilike("email", `%${query}%`);
    if (status === "active" || status === "pending" || status === "suspended") {
      membersQuery = membersQuery.eq("access_status", status);
    }
    const { data, error, count } = await membersQuery;
    if (error) throw new Error(error.message);

    const ids = (data ?? []).map((profile) => profile.id);
    const [{ data: subscriptions }, spendById] = await Promise.all([
      ids.length
        ? service
            .from("subscriptions")
            .select("profile_id, plan, status, billing_interval")
            .in("profile_id", ids)
        : Promise.resolve({ data: [] }),
      loadMemberSpendSummaries(service, ids),
    ]);
    const balances = new Map(
      await Promise.all(
        ids.map(async (id) => [id, await getCreditBalance(service, id)] as const)
      )
    );
    const plans = new Map<string, { plan: string; status: string; billing_interval?: string }>();
    for (const row of subscriptions ?? []) {
      if (!plans.has(row.profile_id)) plans.set(row.profile_id, row);
    }
    return NextResponse.json({
      members: (data ?? []).map((member) => {
        const spend = spendById.get(member.id);
        return {
          ...member,
          balance: balances.get(member.id) ?? 0,
          subscription: plans.get(member.id) ?? null,
          spend: spend
            ? {
                lifetimeSpendUsd: spend.lifetimeSpendUsd,
                lifetimeActions: spend.lifetimeActions,
                cycleSpendUsd: spend.cycleSpendUsd,
                cycleActions: spend.cycleActions,
                flags: spend.flags,
                marginRiskRatio: spend.marginRiskRatio,
              }
            : null,
        };
      }),
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load members" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { profile: actor, service } = await requireSuperAdmin();
    const body = (await request.json()) as {
      profileId?: string;
      accessStatus?: "active" | "suspended";
      role?: "user" | "super_admin";
      reason?: string;
    };
    const reason = body.reason?.trim();
    if (!body.profileId || !reason || reason.length < 3) {
      return NextResponse.json({ error: "Member and a reason are required" }, { status: 400 });
    }
    if (!body.accessStatus && !body.role) {
      return NextResponse.json({ error: "No account change supplied" }, { status: 400 });
    }
    if (
      body.profileId === actor.id &&
      (body.accessStatus === "suspended" || body.role === "user")
    ) {
      return NextResponse.json(
        { error: "You cannot suspend or remove owner access from your own account" },
        { status: 400 }
      );
    }

    const updates: Record<string, string | boolean> = {};
    if (body.accessStatus) {
      updates.access_status = body.accessStatus;
      updates.disabled = body.accessStatus === "suspended";
    }
    if (body.role) updates.role = body.role;

    const { data, error } = await service
      .from("profiles")
      .update(updates)
      .eq("id", body.profileId)
      .select("id, email, role, access_status")
      .single();
    if (error) throw new Error(error.message);

    await service.from("admin_audit_log").insert({
      actor_profile_id: actor.id,
      target_profile_id: data.id,
      action: body.role ? "member_role_changed" : "member_access_changed",
      reason,
      details: updates,
    });
    return NextResponse.json({ member: data });
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update member" },
      { status: 500 }
    );
  }
}
