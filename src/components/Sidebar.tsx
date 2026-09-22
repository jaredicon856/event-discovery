"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
      { href: "/discover", label: "Discover" },
      { href: "/lists", label: "Saved Lists" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/billing", label: "Billing" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const base = "block rounded px-3 py-2 text-sm font-medium transition-colors";
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
      className={`${base} ${
        active ? "bg-icon-primary-light text-icon-primary" : "text-icon-text-light hover:bg-icon-surface hover:text-icon-text"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-icon-border bg-icon-background px-4 py-6 text-icon-text">
      <div className="mb-8 flex items-center gap-2 px-1">
        <Image src="/brand/icon-logo.webp" alt="Project ICON" width={90} height={32} priority />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Event Scout</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-icon-text-light/70">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={pathname === item.href} />
              ))}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-icon-text-light/70">Admin</p>
          <div className="flex flex-col gap-0.5">
            <NavLink item={{ href: "/admin", label: "Super Admin", disabled: true }} active={false} />
          </div>
        </div>
      </nav>

      <p className="px-3 text-[11px] text-icon-text-light/60">Project ICON</p>
    </aside>
  );
}
