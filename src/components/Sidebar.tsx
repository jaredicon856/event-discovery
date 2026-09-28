"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { isNavActive } from "@/lib/navigation";

interface NavItem {
  href: string;
  label: string;
  disabled?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview" },
      { href: "/opportunities", label: "Opportunities" },
      { href: "/lists", label: "Saved Lists" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/usage", label: "Usage & Credits" },
      { href: "/billing", label: "Billing" },
      { href: "/billing/invoices", label: "Invoice history" },
      { href: "/settings/profile", label: "Profile & Settings" },
    ],
  },
];

function BrandLockup({ compact = false }: { compact?: boolean }) {
  // The wordmark leads and the product name sits under it, set narrower than
  // the logo so the pair reads as one mark rather than two competing labels.
  return (
    <Link
      href="/"
      aria-label="Event Scout overview"
      className="group inline-flex w-fit flex-col items-center transition-opacity hover:opacity-75"
    >
      <Image
        src="/brand/icon-logo.webp"
        alt="Project ICON"
        width={90}
        height={32}
        className={`w-auto object-contain ${compact ? "h-7" : "h-8"}`}
        priority
      />
      <span
        className={`mt-1 font-medium uppercase text-white/40 ${
          compact ? "text-[9px] tracking-[.11em]" : "text-[10px] tracking-[.12em]"
        }`}
      >
        Event Scout
      </span>
    </Link>
  );
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const base = "block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
  if (item.disabled) {
    return (
      <span className={`${base} cursor-not-allowed text-icon-text-light/50`} title="Coming soon">
        {item.label}
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`${base} ${
        active ? "bg-icon-primary-light text-icon-primary" : "text-icon-text-light hover:bg-icon-surface hover:text-icon-text"
      }`}
    >
      {item.label}
    </Link>
  );
}

function NewSearchButton({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/opportunities?tab=new"
      onClick={onNavigate}
      className="mb-6 flex items-center justify-center gap-1.5 rounded-xl bg-icon-primary px-3 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(184,137,50,.95)] transition-colors hover:bg-[#c59a48]"
    >
      <span aria-hidden className="-mt-px text-base leading-none">+</span>
      New search
    </Link>
  );
}

function CreditsPanel({
  credits,
  isOwner,
  onNavigate,
}: {
  credits: number;
  isOwner: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/40">
        {isOwner ? "Owner access" : "Research credits"}
      </p>
      {isOwner ? (
        <p className="mt-1.5 text-sm font-semibold text-white">Unlimited</p>
      ) : (
        <>
          <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-.04em] text-white">
            {credits.toLocaleString()}
          </p>
          <Link
            href="/billing#add-credits"
            onClick={onNavigate}
            className="mt-2.5 inline-block text-xs font-semibold text-[#d4ad62] hover:text-[#e4c27f]"
          >
            Add credits →
          </Link>
        </>
      )}
    </div>
  );
}

function UserMenu({
  displayName,
  email,
  avatarUrl,
  onNavigate,
  onLogout,
}: {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 hover:bg-white/[0.08]">
        <ProfileAvatar src={avatarUrl} name={displayName} />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">{displayName}</span>
          <span className="block truncate text-xs text-icon-text-light">{email}</span>
        </span>
        <span aria-hidden className="text-xs text-icon-text-light">⌃</span>
      </summary>
      <div className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-full min-w-52 overflow-hidden rounded-xl border border-icon-border bg-[#0b2425] p-1.5 shadow-xl">
        <p className="truncate px-3 py-2 text-xs text-icon-text-light">{email}</p>
        <Link href="/settings/profile" onClick={onNavigate} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/[0.07]">My Profile</Link>
        <Link href="/settings/security" onClick={onNavigate} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/[0.07]">Account &amp; Security</Link>
        <button onClick={onLogout} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.07]">Sign out</button>
      </div>
    </details>
  );
}

export function Sidebar({
  email,
  role,
  credits,
  displayName,
  avatarUrl,
}: {
  email: string;
  role: string;
  credits: number;
  displayName: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = role === "super_admin";

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navigation = (onNavigate?: () => void) => (
    <nav className="flex flex-1 flex-col gap-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-icon-text-light/70">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items
                .filter((item) => !(isAdmin && item.href === "/billing/invoices"))
                .map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavActive(pathname, item.href)}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}

        {isAdmin && <div className="shrink-0">
          <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wide text-icon-text-light/70 lg:block">Administration</p>
          <div className="flex flex-row gap-0.5 lg:flex-col">
            <NavLink
              item={{ href: "/admin", label: "Members & Usage" }}
              active={pathname === "/admin"}
              onClick={onNavigate}
            />
          </div>
        </div>}
      </nav>
  );

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/10 bg-icon-background px-4 py-3 text-icon-text min-[900px]:hidden">
        <BrandLockup compact />
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold"
        >
          Menu
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 min-[900px]:hidden">
          <button aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/55" />
          <aside id="mobile-navigation" className="relative flex h-full w-[min(88vw,340px)] flex-col bg-icon-background p-5 text-icon-text shadow-2xl">
            <div className="mb-7 flex items-center justify-between">
              <BrandLockup />
              <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-xl" aria-label="Close navigation">×</button>
            </div>
            <NewSearchButton onNavigate={() => setMobileOpen(false)} />
            {navigation(() => setMobileOpen(false))}
            <CreditsPanel credits={credits} isOwner={isAdmin} onNavigate={() => setMobileOpen(false)} />
            <UserMenu displayName={displayName} email={email} avatarUrl={avatarUrl} onNavigate={() => setMobileOpen(false)} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-white/10 bg-icon-background px-3 py-5 text-icon-text min-[900px]:flex">
        <div className="mb-5 flex justify-center border-b border-white/[0.07] px-3 pb-5">
          <BrandLockup />
        </div>
        <NewSearchButton />
        {navigation()}
        <CreditsPanel credits={credits} isOwner={isAdmin} />
        <UserMenu displayName={displayName} email={email} avatarUrl={avatarUrl} onLogout={handleLogout} />
      </aside>
    </>
  );
}
