"use client";

import { useState } from "react";

function useReturnToAdmin() {
  const [busy, setBusy] = useState(false);
  async function stop() {
    setBusy(true);
    try {
      await fetch("/api/admin/impersonate", { method: "DELETE" });
    } finally {
      // Full load: client-cached pages were rendered as the member.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin");
    }
  }
  return { busy, stop };
}

export function ReturnToAdminButton({ className = "" }: { className?: string }) {
  const { busy, stop } = useReturnToAdmin();
  return (
    <button
      type="button"
      onClick={stop}
      disabled={busy}
      className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide disabled:opacity-60 ${className}`}
    >
      {busy ? "Returning…" : "← Return to admin"}
    </button>
  );
}

export function ImpersonationBanner({ targetEmail }: { targetEmail: string }) {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-11 items-center justify-center gap-4 bg-amber-500 px-4 text-sm font-semibold text-amber-950 shadow-md">
      <span className="truncate">
        You are viewing <strong>{targetEmail}</strong>&apos;s account — this is exactly what they see
      </span>
      <ReturnToAdminButton className="shrink-0 bg-amber-950 text-amber-50 hover:bg-amber-900" />
    </div>
  );
}
