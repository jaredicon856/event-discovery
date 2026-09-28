"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatAccountDateTime } from "@/lib/timezone";

interface Member {
  id: string;
  email: string;
  display_name: string | null;
  full_name: string | null;
  role: string;
  access_status: string;
  created_at: string;
  balance: number;
  subscription: { plan: string; status: string; billing_interval?: string } | null;
  spend: {
    lifetimeSpendUsd: number;
    lifetimeActions: number;
    cycleSpendUsd: number;
    cycleActions: number;
    flags: Array<"margin_risk" | "usage_ceiling">;
    marginRiskRatio: number | null;
  } | null;
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  expires_at: string;
}

interface AuditEntry {
  id: string;
  action: string;
  reason: string;
  created_at: string;
  target_profile_id: string | null;
}

interface ResearchRun {
  id: string;
  profile_id: string | null;
  member_email: string;
  member_name: string | null;
  query: string;
  sector: string;
  status: string;
  current_stage: string;
  events_found: number;
  contacts_found: number;
  estimated_cost_usd: number;
  created_at: string;
}

interface MemberDetail {
  profile: {
    id: string;
    email: string;
    display_name: string | null;
    full_name: string | null;
    company: string | null;
    job_title: string | null;
    role: string;
    access_status: string;
    created_at: string;
  };
  runs: Array<{
    id: string;
    query: string;
    status: string;
    events_found: number;
    contacts_found: number;
    credits_charged: number;
    credits_refunded: number;
    estimated_cost_usd: number;
    created_at: string;
  }>;
  operations: Array<{
    id: string;
    action: string;
    amount: number;
    status: string;
    created_at: string;
  }>;
  balance: number;
  subscription: { plan: string; status: string; billing_interval?: string } | null;
  spend: Member["spend"];
}

interface FeatureFlag {
  key: string;
  enabled: boolean;
  updated_at: string | null;
}

const FEATURE_FLAG_LABELS: Record<string, string> = {
  discovery: "Discovery",
  enrichment: "Enrichment",
  pdf_export: "PDF Export",
  scheduling: "Scheduling",
  saved_lists: "Saved Lists",
};

function formatAdminDate(value: string) {
  return formatAccountDateTime(value);
}

function pageHref(page: number, query: string, status: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);
  params.set("page", String(page));
  return `/admin?${params.toString()}`;
}

function memberHref(memberId: string, page: number, query: string, status: string) {
  const params = new URLSearchParams(pageHref(page, query, status).split("?")[1]);
  params.set("member", memberId);
  return `/admin?${params.toString()}`;
}

export function AdminConsole({
  actorId,
  members,
  memberPage,
  memberDetail,
  recentResearch,
  invitations,
  audit,
  featureFlags,
}: {
  actorId: string;
  members: Member[];
  memberPage: {
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    query: string;
    status: string;
  };
  memberDetail: MemberDetail | null;
  recentResearch: ResearchRun[];
  invitations: Invitation[];
  audit: AuditEntry[];
  featureFlags: FeatureFlag[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [flagBusyKey, setFlagBusyKey] = useState<string | null>(null);
  const [creditTarget, setCreditTarget] = useState<Member | null>(null);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await response.json();
    setNotice(
      response.ok
        ? json.emailSent
          ? `Invitation sent to ${email}.`
          : `${json.deliveryWarning} ${json.acceptUrl}`
        : json.error
    );
    if (response.ok) {
      setEmail("");
      router.refresh();
    }
    setBusy(false);
  }

  async function changeAccess(member: Member) {
    if (member.id === actorId) {
      setNotice("You cannot suspend your own owner account.");
      return;
    }
    const next = member.access_status === "active" ? "suspended" : "active";
    const reason = window.prompt(`Reason to mark ${member.email} ${next}:`);
    if (!reason) return;
    const response = await fetch("/api/admin/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: member.id, accessStatus: next, reason }),
    });
    const json = await response.json();
    setNotice(response.ok ? `${member.email} is now ${next}.` : json.error);
    if (response.ok) router.refresh();
  }

  async function submitCreditAdjustment(member: Member, amount: number, reason: string): Promise<string | null> {
    const response = await fetch("/api/admin/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: member.id, amount, reason }),
    });
    const json = await response.json();
    if (!response.ok) return json.error ?? "Could not adjust credits";
    setNotice(
      amount > 0
        ? `Added ${amount.toLocaleString()} credits to ${member.email}.`
        : `Removed ${Math.abs(amount).toLocaleString()} credits from ${member.email}.`
    );
    setCreditTarget(null);
    router.refresh();
    return null;
  }

  async function loginAs(member: Member) {
    if (!window.confirm(`View the app as ${member.email}? This is audit-logged.`)) return;
    const response = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetProfileId: member.id }),
    });
    const json = await response.json();
    if (!response.ok) {
      setNotice(json.error ?? "Failed to start impersonation");
      return;
    }
    // Full load so the shared layout and every client-cached page re-render as
    // the member; a client push keeps the owner's sidebar and omits the banner.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  async function toggleFlag(flag: FeatureFlag) {
    const next = !flag.enabled;
    const reason = window.prompt(
      `Reason to ${next ? "enable" : "disable"} ${FEATURE_FLAG_LABELS[flag.key] ?? flag.key} for everyone:`
    );
    if (!reason) return;
    setFlagBusyKey(flag.key);
    const response = await fetch("/api/admin/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: flag.key, enabled: next, reason }),
    });
    const json = await response.json();
    setNotice(
      response.ok
        ? `${FEATURE_FLAG_LABELS[flag.key] ?? flag.key} is now ${next ? "enabled" : "disabled"}.`
        : json.error
    );
    setFlagBusyKey(null);
    if (response.ok) router.refresh();
  }

  async function revoke(invitation: Invitation) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    const response = await fetch(`/api/admin/invitations/${invitation.id}`, { method: "DELETE" });
    const json = await response.json();
    setNotice(response.ok ? `Revoked invitation for ${invitation.email}.` : json.error);
    if (response.ok) router.refresh();
  }

  const firstMember = memberPage.total === 0 ? 0 : (memberPage.page - 1) * memberPage.pageSize + 1;
  const lastMember = Math.min(memberPage.page * memberPage.pageSize, memberPage.total);

  return (
    <div className="space-y-8">
      {creditTarget && (
        <CreditAdjustDialog
          member={creditTarget}
          onClose={() => setCreditTarget(null)}
          onSubmit={(amount, reason) => submitCreditAdjustment(creditTarget, amount, reason)}
        />
      )}
      {notice && <p role="status" className="animate-enter rounded-xl border border-icon-primary/25 bg-icon-primary-light px-4 py-3 text-sm font-medium">{notice}</p>}

      {memberDetail && (
        <section id="member-detail" className="premium-card-dark animate-enter overflow-hidden">
          <div className="flex flex-col gap-5 border-b border-white/10 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#d4ad62]">Member control room</p>
              <h2 className="mt-2 text-2xl font-semibold">{memberDetail.profile.display_name || memberDetail.profile.full_name || memberDetail.profile.email}</h2>
              <p className="mt-1 text-sm text-white/55">{memberDetail.profile.email}</p>
              <p className="mt-3 text-xs text-white/45">
                {memberDetail.profile.job_title || "No job title"}{memberDetail.profile.company ? ` · ${memberDetail.profile.company}` : ""} · Joined {formatAdminDate(memberDetail.profile.created_at)}
              </p>
            </div>
            <Link href={pageHref(memberPage.page, memberPage.query, memberPage.status)} className="self-start rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10">
              Close detail
            </Link>
          </div>
          <div className="grid gap-px bg-white/10 md:grid-cols-3 xl:grid-cols-6">
            <div className="bg-[#082021] p-5"><p className="text-xs text-white/45">Credits</p><p className="mt-1 text-2xl font-semibold">{memberDetail.balance.toLocaleString()}</p></div>
            <div className="bg-[#082021] p-5"><p className="text-xs text-white/45">Plan</p><p className="mt-1 text-2xl font-semibold capitalize">{memberDetail.subscription?.plan ?? "None"}{memberDetail.subscription?.billing_interval === "year" ? " · annual" : ""}</p></div>
            <div className="bg-[#082021] p-5"><p className="text-xs text-white/45">Access</p><p className="mt-1 text-2xl font-semibold capitalize">{memberDetail.profile.access_status}</p></div>
            <div className="bg-[#082021] p-5"><p className="text-xs text-white/45">Lifetime AI spend</p><p className="mt-1 text-2xl font-semibold">${(memberDetail.spend?.lifetimeSpendUsd ?? 0).toFixed(2)}</p><p className="mt-1 text-xs text-white/40">{memberDetail.spend?.lifetimeActions ?? 0} actions</p></div>
            <div className="bg-[#082021] p-5"><p className="text-xs text-white/45">This cycle spend</p><p className="mt-1 text-2xl font-semibold">${(memberDetail.spend?.cycleSpendUsd ?? 0).toFixed(2)}</p><p className="mt-1 text-xs text-white/40">{memberDetail.spend?.cycleActions ?? 0} actions</p></div>
            <div className="bg-[#082021] p-5">
              <p className="text-xs text-white/45">Flags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(memberDetail.spend?.flags?.length ?? 0) === 0 && <span className="text-sm text-white/45">None</span>}
                {memberDetail.spend?.flags?.includes("margin_risk") && (
                  <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-200">Margin risk</span>
                )}
                {memberDetail.spend?.flags?.includes("usage_ceiling") && (
                  <span className="rounded-full bg-red-400/20 px-2.5 py-1 text-xs font-semibold text-red-200">Usage ceiling</span>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-6 p-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Latest research</h3>
              <div className="mt-3 space-y-2">
                {memberDetail.runs.map((run) => (
                  <div key={run.id} className="rounded-xl border border-white/10 bg-white/[.04] p-3">
                    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{run.query}</p><span className="text-xs capitalize text-[#d4ad62]">{run.status.replaceAll("_", " ")}</span></div>
                    <p className="mt-2 text-xs text-white/45">{run.events_found} opportunities · {run.contacts_found} contacts · ${Number(run.estimated_cost_usd).toFixed(3)} · {formatAdminDate(run.created_at)}</p>
                  </div>
                ))}
                {memberDetail.runs.length === 0 && <p className="text-sm text-white/45">No research yet.</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Credit operations</h3>
              <div className="mt-3 space-y-2">
                {memberDetail.operations.map((operation) => (
                  <div key={operation.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.04] p-3 text-sm">
                    <div><p className="font-medium capitalize">{operation.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-white/45">{formatAdminDate(operation.created_at)}</p></div>
                    <div className="text-right"><p className="font-semibold">{operation.amount} credits</p><p className="text-xs capitalize text-white/45">{operation.status}</p></div>
                  </div>
                ))}
                {memberDetail.operations.length === 0 && <p className="text-sm text-white/45">No credit operations yet.</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="premium-card overflow-hidden">
        <div className="grid gap-6 border-b border-icon-border p-5 lg:grid-cols-[1fr_1.3fr] lg:p-6">
          <div>
            <p className="premium-eyebrow">Customer access</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em]">Members</h2>
            <p className="mt-2 text-sm text-icon-text-light">Search and filter without loading the full customer base.</p>
          </div>
          <form method="get" action="/admin" className="grid items-end gap-3 sm:grid-cols-[1fr_160px_auto]">
            <label className="text-xs font-semibold text-icon-text-light">Search email
              <input name="q" type="search" defaultValue={memberPage.query} placeholder="name@company.com" className="premium-input mt-1.5 min-h-11 w-full" />
            </label>
            <label className="text-xs font-semibold text-icon-text-light">Access
              <select name="status" defaultValue={memberPage.status} className="premium-input mt-1.5 min-h-11 w-full">
                <option value="all">All access</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option>
              </select>
            </label>
            <button className="premium-button min-h-11 bg-icon-background text-white">Apply</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] divide-y divide-icon-border text-sm">
            <thead className="bg-icon-primary-light/60 text-left text-[11px] uppercase tracking-[.12em] text-icon-text-light">
              <tr>
                <th className="px-5 py-3">Member</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Cycle spend</th>
                <th className="px-4 py-3">Lifetime</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-5 py-3 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-icon-border">
              {members.map((member) => {
                const name = member.display_name || member.full_name;
                return (
                  <tr key={member.id} className="transition-colors hover:bg-icon-primary-light/35">
                    <td className="px-5 py-4"><p className="font-semibold">{name || member.email}</p>{name && <p className="mt-0.5 text-xs text-icon-text-light">{member.email}</p>}</td>
                    <td className="px-4 py-4 text-icon-text-light">
                      {member.subscription ? (
                        <span className="capitalize">
                          {member.subscription.plan}
                          {member.subscription.billing_interval === "year" ? " · annual" : ""} · {member.subscription.status}
                        </span>
                      ) : (
                        "No paid plan"
                      )}
                    </td>
                    <td className="px-4 py-4 font-semibold">{member.balance.toLocaleString()}</td>
                    <td className="px-4 py-4">
                      <p className="font-semibold">${(member.spend?.cycleSpendUsd ?? 0).toFixed(2)}</p>
                      <p className="text-[11px] text-icon-text-light">{member.spend?.cycleActions ?? 0} actions</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold">${(member.spend?.lifetimeSpendUsd ?? 0).toFixed(2)}</p>
                      <p className="text-[11px] text-icon-text-light">{member.spend?.lifetimeActions ?? 0} actions</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(member.spend?.flags.length ?? 0) === 0 && <span className="text-xs text-icon-text-light">—</span>}
                        {member.spend?.flags.includes("margin_risk") && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">Margin</span>
                        )}
                        {member.spend?.flags.includes("usage_ceiling") && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">Ceiling</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${member.access_status === "active" ? "bg-emerald-50 text-emerald-700" : member.access_status === "suspended" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{member.access_status}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1.5">
                        <Link href={memberHref(member.id, memberPage.page, memberPage.query, memberPage.status)} className="rounded-lg border border-icon-border px-2.5 py-1.5 text-xs font-semibold hover:border-icon-primary">View</Link>
                        <button onClick={() => setCreditTarget(member)} className="cursor-pointer rounded-lg border border-icon-border px-2.5 py-1.5 text-xs font-semibold hover:border-icon-primary">Credits</button>
                        <button onClick={() => changeAccess(member)} disabled={member.id === actorId} className="cursor-pointer rounded-lg border border-icon-border px-2.5 py-1.5 text-xs font-semibold hover:border-icon-primary disabled:cursor-not-allowed disabled:opacity-35">{member.access_status === "active" ? "Suspend" : "Activate"}</button>
                        {member.role !== "super_admin" && (
                          <button onClick={() => loginAs(member)} className="cursor-pointer rounded-lg border border-icon-border px-2.5 py-1.5 text-xs font-semibold hover:border-icon-primary">Login as</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-icon-text-light">No members match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-icon-border px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-icon-text-light">Showing {firstMember.toLocaleString()}–{lastMember.toLocaleString()} of {memberPage.total.toLocaleString()}</p>
          <div className="flex items-center gap-2">
            <Link aria-disabled={memberPage.page <= 1} href={pageHref(Math.max(1, memberPage.page - 1), memberPage.query, memberPage.status)} className={`rounded-lg border border-icon-border px-3 py-2 text-xs font-semibold ${memberPage.page <= 1 ? "pointer-events-none opacity-35" : "hover:border-icon-primary"}`}>Previous</Link>
            <span className="px-2 text-xs font-semibold">Page {memberPage.page} of {memberPage.totalPages}</span>
            <Link aria-disabled={memberPage.page >= memberPage.totalPages} href={pageHref(Math.min(memberPage.totalPages, memberPage.page + 1), memberPage.query, memberPage.status)} className={`rounded-lg border border-icon-border px-3 py-2 text-xs font-semibold ${memberPage.page >= memberPage.totalPages ? "pointer-events-none opacity-35" : "hover:border-icon-primary"}`}>Next</Link>
          </div>
        </div>
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-icon-border p-5 sm:p-6">
          <p className="premium-eyebrow">Live customer activity</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em]">Recent research</h2>
          <p className="mt-2 text-sm text-icon-text-light">Every run names the member who requested it—no anonymous activity.</p>
        </div>
        <div className="divide-y divide-icon-border">
          {recentResearch.map((run) => (
            <div key={run.id} className="grid gap-4 px-5 py-4 transition-colors hover:bg-icon-primary-light/35 md:grid-cols-[1.4fr_.8fr_auto] md:items-center">
              <div className="min-w-0"><p className="truncate font-semibold">{run.query}</p><p className="mt-1 text-xs uppercase tracking-[.09em] text-icon-text-light">{run.sector} · {formatAdminDate(run.created_at)}</p></div>
              <div><p className="text-sm font-semibold">{run.member_name || run.member_email}</p>{run.member_name && <p className="mt-0.5 text-xs text-icon-text-light">{run.member_email}</p>}</div>
              <div className="flex items-center gap-4 text-right"><div><p className="text-sm font-semibold">{run.events_found} / {run.contacts_found}</p><p className="text-[11px] text-icon-text-light">events / contacts</p></div><div><span className="rounded-full bg-icon-primary-light px-2.5 py-1 text-xs font-semibold capitalize text-icon-primary">{run.status.replaceAll("_", " ")}</span><p className="mt-1 text-[11px] text-icon-text-light">${Number(run.estimated_cost_usd).toFixed(3)}</p></div></div>
            </div>
          ))}
          {recentResearch.length === 0 && <p className="p-8 text-sm text-icon-text-light">No customer research yet.</p>}
        </div>
      </section>

      <section className="premium-card overflow-hidden">
        <div className="border-b border-icon-border p-5 sm:p-6">
          <p className="premium-eyebrow">Kill switches</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em]">Feature toggles</h2>
          <p className="mt-2 text-sm text-icon-text-light">Global on/off for each tool. Per-customer overrides can be added later.</p>
        </div>
        <div className="divide-y divide-icon-border">
          {featureFlags.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="font-semibold">{FEATURE_FLAG_LABELS[flag.key] ?? flag.key}</p>
                <p className="mt-0.5 text-xs text-icon-text-light">
                  {flag.enabled ? "Enabled" : "Disabled"}
                  {flag.updated_at ? ` · last changed ${formatAdminDate(flag.updated_at)}` : ""}
                </p>
              </div>
              <button
                onClick={() => toggleFlag(flag)}
                disabled={flagBusyKey === flag.key}
                className={`min-w-24 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                  flag.enabled
                    ? "border-icon-border hover:border-red-400 hover:text-red-700"
                    : "border-icon-primary/40 bg-icon-primary-light text-icon-primary hover:border-icon-primary"
                }`}
              >
                {flagBusyKey === flag.key ? "Saving…" : flag.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
          {featureFlags.length === 0 && <p className="p-8 text-sm text-icon-text-light">No feature flags configured.</p>}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <div className="premium-card p-5 sm:p-6">
          <p className="premium-eyebrow">Access pipeline</p>
          <h2 className="mt-2 text-xl font-semibold">Invite a customer</h2>
          <p className="mt-2 text-sm leading-6 text-icon-text-light">Invitations expire after 72 hours and grant customer access—not a subscription.</p>
          <form onSubmit={invite} className="mt-5 flex flex-col gap-3">
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="customer@example.com" className="premium-input min-h-11" />
            <button disabled={busy} className="premium-button min-h-11 cursor-pointer bg-icon-primary font-semibold text-white disabled:opacity-60">{busy ? "Sending…" : "Send invitation"}</button>
          </form>
          <div className="mt-6 space-y-2 border-t border-icon-border pt-5">
            {invitations.slice(0, 8).map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-xl bg-icon-primary-light/50 p-3 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{invitation.email}</p><p className="mt-0.5 text-xs capitalize text-icon-text-light">{invitation.status} · expires {formatAdminDate(invitation.expires_at)}</p></div>
                {invitation.status === "pending" && <button onClick={() => revoke(invitation)} className="cursor-pointer text-xs font-semibold text-red-700 hover:underline">Revoke</button>}
              </div>
            ))}
            {invitations.length === 0 && <p className="text-sm text-icon-text-light">No invitations yet.</p>}
          </div>
        </div>
        <div className="premium-card p-5 sm:p-6">
          <p className="premium-eyebrow">Accountability</p>
          <h2 className="mt-2 text-xl font-semibold">Audit history</h2>
          <div className="mt-5 divide-y divide-icon-border">
            {audit.map((entry) => (
              <div key={entry.id} className="py-3 first:pt-0"><div className="flex items-start justify-between gap-4"><p className="text-sm font-semibold capitalize">{entry.action.replaceAll("_", " ")}</p><p className="shrink-0 text-xs text-icon-text-light">{formatAdminDate(entry.created_at)}</p></div><p className="mt-1 text-sm leading-5 text-icon-text-light">{entry.reason}</p></div>
            ))}
            {audit.length === 0 && <p className="text-sm text-icon-text-light">No administrative changes yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

const CREDIT_PRESETS = [
  { credits: 20, hint: "1 search or 1 contact" },
  { credits: 100, hint: "5 actions" },
  { credits: 500, hint: "25 actions" },
  { credits: 1000, hint: "Starter month" },
];

function CreditAdjustDialog({
  member,
  onClose,
  onSubmit,
}: {
  member: Member;
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [credits, setCredits] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = Number(credits);
  const validAmount = Number.isInteger(value) && value > 0;
  const tooMuch = mode === "remove" && validAmount && value > member.balance;
  const newBalance = validAmount ? member.balance + (mode === "add" ? value : -value) : member.balance;
  const canSave = validAmount && !tooMuch && reason.trim().length >= 3 && !saving;
  const name = member.display_name || member.full_name || member.email;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const failure = await onSubmit(mode === "add" ? value : -value, reason.trim());
    if (failure) {
      setError(failure);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="credit-dialog-title">
      <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-icon-surface p-6 text-icon-text shadow-2xl">
        <p className="premium-eyebrow">Credits</p>
        <h2 id="credit-dialog-title" className="mt-2 text-xl font-semibold">{name}</h2>
        <p className="mt-1 text-sm text-icon-text-light">
          Currently has <strong className="text-icon-text">{member.balance.toLocaleString()}</strong> credits. A search costs 20, each contact costs 20.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full border border-icon-border p-1">
          {(["add", "remove"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`cursor-pointer rounded-full py-2 text-sm font-semibold ${mode === option ? "bg-icon-primary text-white" : "text-icon-text-light hover:text-icon-text"}`}
            >
              {option === "add" ? "Give credits" : "Take away credits"}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {CREDIT_PRESETS.map((preset) => (
            <button
              key={preset.credits}
              type="button"
              onClick={() => setCredits(String(preset.credits))}
              className={`cursor-pointer rounded-xl border px-2 py-2 text-center ${Number(credits) === preset.credits ? "border-icon-primary bg-icon-primary-light" : "border-icon-border hover:border-icon-primary"}`}
            >
              <span className="block text-sm font-semibold">{preset.credits.toLocaleString()}</span>
              <span className="block text-[10px] leading-tight text-icon-text-light">{preset.hint}</span>
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-semibold">
          Or type an amount
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            placeholder="e.g. 100"
            className="mt-1.5 w-full rounded-xl border border-icon-border bg-transparent px-3 py-2.5 text-sm font-normal outline-none focus:border-icon-primary"
          />
        </label>

        <label className="mt-4 block text-sm font-semibold">
          Why? <span className="font-normal text-icon-text-light">(saved in the audit history)</span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={mode === "add" ? "e.g. Refund for a bad search" : "e.g. Added by mistake"}
            className="mt-1.5 w-full rounded-xl border border-icon-border bg-transparent px-3 py-2.5 text-sm font-normal outline-none focus:border-icon-primary"
          />
        </label>

        <p className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${tooMuch ? "bg-red-50 text-red-700" : "bg-icon-background text-icon-text-light"}`}>
          {tooMuch
            ? `They only have ${member.balance.toLocaleString()} credits — you can take away at most that.`
            : validAmount
              ? <>New balance: <strong className="text-icon-text">{newBalance.toLocaleString()}</strong> credits</>
              : "Pick or type how many credits."}
        </p>
        {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-full border border-icon-border px-4 py-2 text-sm font-semibold hover:border-icon-primary">Cancel</button>
          <button type="submit" disabled={!canSave} className="cursor-pointer rounded-full bg-icon-primary px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "Saving…" : mode === "add" ? "Give credits" : "Take away credits"}
          </button>
        </div>
      </form>
    </div>
  );
}
